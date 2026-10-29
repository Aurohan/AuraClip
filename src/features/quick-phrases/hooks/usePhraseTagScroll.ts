import React, { useCallback, useRef, useState } from "react";

/** Shared mechanics for the phrase category bar and its draggable track. */
export function usePhraseTagScroll() {
  const tagBarRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const isDraggingThumbRef = useRef(false);
  const isDraggingBarRef = useRef(false);
  const barStartXRef = useRef(0);
  const barStartScrollLeftRef = useRef(0);

  const [tagScrollProgress, setTagScrollProgress] = useState({
    canScroll: false,
    thumbWidthRatio: 1,
    thumbLeftRatio: 0,
  });

  const updateTagScrollMetrics = useCallback(() => {
    const el = tagBarRef.current;
    if (!el) return;
    const canScroll = el.scrollWidth > el.clientWidth + 2;
    if (!canScroll) {
      setTagScrollProgress({ canScroll: false, thumbWidthRatio: 1, thumbLeftRatio: 0 });
      return;
    }
    const maxScroll = el.scrollWidth - el.clientWidth;
    const thumbWidthRatio = Math.max(0.12, Math.min(1, el.clientWidth / el.scrollWidth));
    const thumbLeftRatio = maxScroll > 0 ? Math.max(0, Math.min(1, el.scrollLeft / maxScroll)) : 0;
    setTagScrollProgress({ canScroll: true, thumbWidthRatio, thumbLeftRatio });
  }, []);



  // Mouse wheel horizontal scroll on tag bar (ultra smooth)
  const handleTagBarWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (tagBarRef.current && e.deltaY !== 0) {
      e.preventDefault();
      tagBarRef.current.scrollLeft += e.deltaY * 0.95;
      updateTagScrollMetrics();
    }
  };

  // Direct drag-to-scroll on tag bar background
  const handleBarPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button, input")) return;
    const el = e.currentTarget;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {}
    isDraggingBarRef.current = true;
    barStartXRef.current = e.clientX;
    barStartScrollLeftRef.current = tagBarRef.current?.scrollLeft || 0;
  };

  const handleBarPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingBarRef.current || !tagBarRef.current) return;
    const deltaX = e.clientX - barStartXRef.current;
    tagBarRef.current.scrollLeft = barStartScrollLeftRef.current - deltaX;
    updateTagScrollMetrics();
  };

  const handleBarPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingBarRef.current) {
      isDraggingBarRef.current = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  // Click on track to jump smoothly
  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!trackRef.current || !tagBarRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const trackWidth = rect.width;
    const el = tagBarRef.current;
    const maxScroll = el.scrollWidth - el.clientWidth;
    if (maxScroll <= 0) return;
    const thumbWidthRatio = Math.max(0.12, Math.min(1, el.clientWidth / el.scrollWidth));
    const thumbWidth = thumbWidthRatio * trackWidth;
    const availableTrack = Math.max(1, trackWidth - thumbWidth);
    const targetLeft = Math.max(0, Math.min(availableTrack, clickX - thumbWidth / 2));
    const ratio = targetLeft / availableTrack;
    el.scrollTo({
      left: ratio * maxScroll,
      behavior: "smooth",
    });
  };

  // Drag the thumb with high precision & 1:1 hardware responsiveness
  const dragStartXRef = useRef(0);
  const dragStartScrollLeftRef = useRef(0);

  const handleThumbPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const thumb = e.currentTarget;
    thumb.setPointerCapture(e.pointerId);
    isDraggingThumbRef.current = true;
    dragStartXRef.current = e.clientX;
    dragStartScrollLeftRef.current = tagBarRef.current?.scrollLeft || 0;
  };

  const handleThumbPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingThumbRef.current || !tagBarRef.current || !trackRef.current) return;
    const deltaX = e.clientX - dragStartXRef.current;
    const trackWidth = trackRef.current.clientWidth;
    const el = tagBarRef.current;
    const maxScroll = el.scrollWidth - el.clientWidth;
    if (maxScroll <= 0) return;
    const thumbWidthRatio = Math.max(0.12, Math.min(1, el.clientWidth / el.scrollWidth));
    const thumbWidth = thumbWidthRatio * trackWidth;
    const availableTrack = Math.max(1, trackWidth - thumbWidth);
    const deltaScroll = (deltaX / availableTrack) * maxScroll;
    el.scrollLeft = dragStartScrollLeftRef.current + deltaScroll;
    updateTagScrollMetrics();
  };

  const handleThumbPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingThumbRef.current) {
      isDraggingThumbRef.current = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
    }
  };


  return {
    tagBarRef, trackRef, isDraggingThumbRef, tagScrollProgress, updateTagScrollMetrics,
    handleTagBarWheel, handleBarPointerDown, handleBarPointerMove, handleBarPointerUp,
    handleTrackClick, handleThumbPointerDown, handleThumbPointerMove, handleThumbPointerUp,
  };
}

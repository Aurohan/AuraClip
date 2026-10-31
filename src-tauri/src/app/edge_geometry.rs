/// A screen in physical pixels (how Windows lays out monitors).
#[derive(Clone, Copy, Debug)]
struct LayoutRect {
    left: f64,
    top: f64,
    right: f64,
    bottom: f64,
}

fn layout_rect(monitor: &tauri::Monitor) -> LayoutRect {
    let pos = monitor.position();
    let size = monitor.size();
    LayoutRect {
        left: pos.x as f64,
        top: pos.y as f64,
        right: pos.x as f64 + size.width as f64,
        bottom: pos.y as f64 + size.height as f64,
    }
}

/// Whether another screen borders `screen` along the `dock` edge (1 top,
/// 2 left, 3 right) where the window lies, `from..to` along that edge.
fn edge_borders_screen(
    screen: LayoutRect,
    others: &[LayoutRect],
    dock: i32,
    from: f64,
    to: f64,
) -> bool {
    const SLACK: f64 = 2.0;
    others.iter().any(|other| {
        let (touches, other_from, other_to) = match dock {
            1 => (
                (other.bottom - screen.top).abs() <= SLACK,
                other.left,
                other.right,
            ),
            2 => (
                (other.right - screen.left).abs() <= SLACK,
                other.top,
                other.bottom,
            ),
            3 => (
                (other.left - screen.right).abs() <= SLACK,
                other.top,
                other.bottom,
            ),
            _ => return false,
        };
        touches && other_from < to && other_to > from
    })
}

/// Whether the window may tuck into `dock`'s edge of `monitor`. Not where
/// another screen continues: tucked past that edge the window sits on the
/// neighbour in plain sight, which then counts as its screen, so the tuck
/// can't be revealed (it stuck on Windows and bounced on macOS).
pub(super) fn can_dock_on_edge(
    window: &tauri::WebviewWindow,
    monitor: &tauri::Monitor,
    dock: i32,
    rect: (i32, i32, i32, i32),
) -> bool {
    let Ok(monitors) = window.available_monitors() else {
        return true;
    };
    let others: Vec<LayoutRect> = monitors.iter().map(layout_rect).collect();
    let (left, top, right, bottom) = rect;
    let (from, to) = if dock == 1 {
        (left, right)
    } else {
        (top, bottom)
    };
    !edge_borders_screen(
        layout_rect(monitor),
        &others,
        dock,
        from as f64,
        to as f64,
    )
}

#[cfg(test)]
mod edge_tests {
    use super::{edge_borders_screen, LayoutRect};

    fn rect(left: f64, top: f64, width: f64, height: f64) -> LayoutRect {
        LayoutRect {
            left,
            top,
            right: left + width,
            bottom: top + height,
        }
    }

    #[test]
    fn edges_shared_with_another_screen_are_found() {
        let main = rect(0.0, 0.0, 1440.0, 900.0);
        let right = rect(1440.0, 0.0, 1920.0, 1080.0);
        let screens = [main, right];
        assert!(edge_borders_screen(main, &screens, 3, 100.0, 700.0));
        assert!(edge_borders_screen(right, &screens, 2, 100.0, 700.0));
        // Outer edges.
        assert!(!edge_borders_screen(main, &screens, 2, 100.0, 700.0));
        assert!(!edge_borders_screen(main, &screens, 1, 100.0, 500.0));
        assert!(!edge_borders_screen(right, &screens, 3, 100.0, 700.0));
        // The taller screen's left edge continues only down to 900.
        assert!(!edge_borders_screen(right, &screens, 2, 920.0, 1070.0));
    }

    #[test]
    fn a_screen_above_blocks_the_top_edge() {
        let main = rect(0.0, 0.0, 1920.0, 1080.0);
        let above = rect(200.0, -1080.0, 1920.0, 1080.0);
        let screens = [main, above];
        assert!(edge_borders_screen(main, &screens, 1, 600.0, 1000.0));
        assert!(!edge_borders_screen(main, &screens, 1, 0.0, 150.0));
    }
}

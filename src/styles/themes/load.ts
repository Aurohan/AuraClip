import "./index.css";
import "./dark.css";

void import.meta.glob(
  ["./*.css", "!./index.css", "!./dark.css", "!./refined.css"],
  { eager: true }
);

// After every theme: refines the glass themes on top of their own files.
import "./refined.css";

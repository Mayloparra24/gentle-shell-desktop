import { HOME_MODE, type HomeMode, type HomeStatus } from "@shared/bridge-types";
import "./HomeSwitcher.css";

export interface HomeSwitcherProps {
  readonly status: HomeStatus;
  readonly disabled?: boolean;
  readonly onChange: (mode: HomeMode) => void;
}

export function HomeSwitcher({ status, disabled, onChange }: HomeSwitcherProps) {
  return (
    <select
      className="gc-home-switcher"
      aria-label="Home"
      title={status.dir}
      value={status.mode}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as HomeMode)}
    >
      <option value={HOME_MODE.LINK} disabled={!status.detection.found} title={status.detection.dir}>.pi</option>
      <option value={HOME_MODE.ISOLATED}>.gentle-shell</option>
    </select>
  );
}

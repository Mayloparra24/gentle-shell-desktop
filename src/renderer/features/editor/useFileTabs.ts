import { useCallback, useState } from "react";
import type { FileViewerStatus } from "@shared/bridge-types";

interface FileTabs {
  readonly owner: object;
  readonly paths: readonly string[];
  readonly active?: string;
  readonly statuses: Readonly<Record<string, FileViewerStatus | undefined>>;
}

const emptyTabs = (owner: object): FileTabs => ({ owner, paths: [], statuses: {} });

// The owner is the selected chat object, not its cwd: files never cross chat/home selections.
export function useFileTabs(owner: object) {
  const [stored, setStored] = useState<FileTabs>(() => emptyTabs(owner));
  const tabs = stored.owner === owner ? stored : emptyTabs(owner);
  const update = useCallback((change: (previous: FileTabs) => FileTabs) => {
    setStored(previous => change(previous.owner === owner ? previous : emptyTabs(owner)));
  }, [owner]);
  const open = useCallback((path: string) => update(previous => {
    const paths = [...previous.paths];
    if (!paths.includes(path)) {
      if (paths.length === 8) paths.splice(paths.findIndex(candidate => candidate !== previous.active), 1);
      paths.push(path);
    }
    return { ...previous, paths, active: path };
  }), [update]);
  const select = useCallback((active?: string) => update(previous => ({ ...previous, active })), [update]);
  const close = useCallback((path: string) => update(previous => {
    const paths = previous.paths.filter(candidate => candidate !== path);
    const statuses = { ...previous.statuses };
    delete statuses[path];
    return { ...previous, paths, statuses, active: previous.active === path ? paths.at(-1) : previous.active };
  }), [update]);
  const report = useCallback((path: string, status: FileViewerStatus | undefined) => update(previous => ({
    ...previous, statuses: { ...previous.statuses, [path]: status },
  })), [update]);
  return { ...tabs, open, select, close, report };
}

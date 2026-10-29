import { useEffect, useState } from "react";
import type { ChatSummary } from "@shared/bridge-types";
import { useBridge } from "@renderer/shared/bridge/useBridge";
import { ChatsContainer } from "@renderer/features/chats/ChatsContainer";
import { ConversationContainer, type ActiveChat } from "@renderer/features/conversation/ConversationContainer";
import { FirstRunContainer } from "@renderer/features/first-run/FirstRunContainer";
import { WorkspacePanel } from "@renderer/features/workspace/WorkspacePanel";
import { PREVIEW_WORKSPACE } from "@renderer/features/workspace/preview";
import { StatusBar } from "@renderer/features/shell/components/StatusBar";
import { PREVIEW_STATUS } from "@renderer/features/shell/previewStatus";
import { useTheme } from "@renderer/shared/theme/useTheme";
import { TopBar } from "@renderer/features/shell/components/TopBar";
import { useShellLayout } from "@renderer/features/shell/useShellLayout";
import "./App.css";

const NEW_CHAT: ActiveChat = { kind: "new" };

const SCREEN = {
  LOADING: "loading",
  FIRST_RUN: "first-run",
  CHAT: "chat",
} as const;

type Screen = (typeof SCREEN)[keyof typeof SCREEN];

// App shell: composes feature-level containers only (Scope Rule — layout
// wiring lives here, feature internals stay inside their own folder).
// Holds the small `activeChat` selection as local state (no global store
// for M1, see odd/tasks/desktop-m1-chat-core.md's "Selected chat" note) —
// both ChatsContainer (highlighting) and ConversationContainer (which chat
// to open) need it.
//
// Decides between the first-run screen and the normal chat layout from
// bridge.setupStatus() on mount (T5): a brief `loading` screen while that
// resolves, then `first-run` when needsChoice is true, else the chat
// shell directly. FirstRunContainer's onDone flips straight to `chat`
// locally instead of re-querying setupStatus() — it already knows the
// choice it just persisted.
export function App() {
  const bridge = useBridge();
  const [screen, setScreen] = useState<Screen>(SCREEN.LOADING);
  const [activeChat, setActiveChat] = useState<ActiveChat>(NEW_CHAT);
  const { leftOpen, rightOpen, toggleLeft, toggleRight } = useShellLayout();
  const { themeId, setTheme } = useTheme();

  useEffect(() => {
    let cancelled = false;
    bridge
      .setupStatus()
      .then((status) => {
        if (!cancelled) setScreen(status.needsChoice ? SCREEN.FIRST_RUN : SCREEN.CHAT);
      })
      .catch(() => {
        // Fail open: a broken setup-status check should never block the
        // whole app from starting.
        if (!cancelled) setScreen(SCREEN.CHAT);
      });
    return () => {
      cancelled = true;
    };
  }, [bridge]);

  const handleSelectChat = (chat: ChatSummary): void => {
    setActiveChat({ kind: "existing", chat });
  };

  const handleNewChat = (): void => {
    setActiveChat(NEW_CHAT);
  };

  if (screen === SCREEN.LOADING) return <div className="gc-app-loading" />;
  if (screen === SCREEN.FIRST_RUN) return <FirstRunContainer onDone={() => setScreen(SCREEN.CHAT)} />;

  const title = activeChat.kind === "existing" ? activeChat.chat.title : "New chat";

  const statusInfo = activeChat.kind === "existing" ? { ...PREVIEW_STATUS, cwd: activeChat.chat.cwd } : PREVIEW_STATUS;

  return (
    <div className="gc-app">
      <TopBar title={title} leftOpen={leftOpen} rightOpen={rightOpen} onToggleLeft={toggleLeft} onToggleRight={toggleRight}
        themeId={themeId}
        onChangeTheme={setTheme}
      />
      <div className="gc-app__body" data-left-open={leftOpen} data-right-open={rightOpen}>
        <div className="gc-app__left" data-testid="left-panel" data-open={leftOpen} inert={!leftOpen}>
          <ChatsContainer
            onSelectChat={handleSelectChat}
            onNewChat={handleNewChat}
            selectedChatId={activeChat.kind === "existing" ? activeChat.chat.id : undefined}
          />
        </div>
        <ConversationContainer activeChat={activeChat} />
        <div className="gc-app__right" data-testid="right-panel" data-open={rightOpen} inert={!rightOpen}>
          <WorkspacePanel snapshot={PREVIEW_WORKSPACE} />
        </div>
      </div>
      <StatusBar info={statusInfo} sample />
    </div>
  );
}

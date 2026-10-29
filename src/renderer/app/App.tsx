import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatSummary } from "@shared/bridge-types";
import { useBridge } from "@renderer/shared/bridge/useBridge";
import { ChatsContainer } from "@renderer/features/chats/ChatsContainer";
import { ConversationContainer, type ActiveChat } from "@renderer/features/conversation/ConversationContainer";
import { FirstRunContainer } from "@renderer/features/first-run/FirstRunContainer";
import { WorkspacePanel } from "@renderer/features/workspace/WorkspacePanel";
import type { GitState } from "@renderer/features/workspace/WorkspaceDataContainer";
import { StatusBar } from "@renderer/features/shell/components/StatusBar";
import { useTheme } from "@renderer/shared/theme/useTheme";
import { TopBar } from "@renderer/features/shell/components/TopBar";
import { useShellLayout } from "@renderer/features/shell/useShellLayout";
import { ModelsContainer } from "@renderer/features/models/ModelsContainer";
import { SettingsContainer } from "@renderer/features/settings/SettingsContainer";
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
  const [openedChat, setOpenedChat] = useState<ActiveChat | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [view, setView] = useState<"chat" | "models">("chat");
  const openModels = (): void => setView("models");
  const [homeVersion, setHomeVersion] = useState(0);
  const [workspaceGit, setWorkspaceGit] = useState<{ chat: ActiveChat; home: number; git: GitState } | null>(null);
  const handleGitChange = useCallback((git: GitState) => {
    setWorkspaceGit({ chat: activeChat, home: homeVersion, git });
  }, [activeChat, homeVersion]);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
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

  const git = openedChat === activeChat && workspaceGit?.chat === activeChat && workspaceGit.home === homeVersion
    ? workspaceGit.git : undefined;
  const statusInfo = {
    cwd: activeChat.kind === "existing" ? activeChat.chat.cwd : undefined,
    branch: git?.status === "ready" ? git.branch : undefined,
  };

  return (
    <div className="gc-app">
      <TopBar title={title} leftOpen={leftOpen} rightOpen={rightOpen} onToggleLeft={toggleLeft} onToggleRight={toggleRight}
        onOpenSettings={() => setSettingsOpen(true)}
        settingsButtonRef={settingsButtonRef}
      />
      <div className="gc-app__body" data-left-open={leftOpen} data-right-open={rightOpen}>
        <div className="gc-app__left" data-testid="left-panel" data-open={leftOpen} inert={!leftOpen}>
          <ChatsContainer
            key={homeVersion}
            onSelectChat={handleSelectChat}
            onNewChat={handleNewChat}
            selectedChatId={activeChat.kind === "existing" ? activeChat.chat.id : undefined}
          />
        </div>
        <div className="gc-app__center">
          <div className="gc-app__chat" hidden={view !== "chat"}>
            <ConversationContainer key={homeVersion} activeChat={activeChat} onOpenModels={openModels} onChatReady={setOpenedChat} />
          </div>
          {view === "models" && <ModelsContainer key={homeVersion} onBack={() => setView("chat")} />}
        </div>
        <div className="gc-app__right" data-testid="right-panel" data-open={rightOpen} inert={!rightOpen}>
          <WorkspacePanel onGitChange={handleGitChange}
            chatId={`${homeVersion}-${activeChat.kind === "existing" ? activeChat.chat.id : "new"}`}
            ready={openedChat === activeChat} />
        </div>
      </div>
      <StatusBar info={statusInfo} />
      {settingsOpen && <SettingsContainer
        onOpenModels={openModels}
        homeVersion={homeVersion}
        themeId={themeId}
        onChangeTheme={setTheme}
        onClose={() => { setSettingsOpen(false); settingsButtonRef.current?.focus(); }}
        onHomeChanged={() => { setOpenedChat(null); handleNewChat(); setHomeVersion((version) => version + 1); }}
      />}
    </div>
  );
}

import { AppShell } from "@/components/aura/app-shell";
import { WorkspaceSessionGuard } from "@/components/aura/workspace-session-guard";
import { AuraConfigProvider } from "@/hooks/use-aura-config";
import { LearningTasksProvider } from "@/hooks/use-learning-tasks";

export default function WorkspaceLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <AuraConfigProvider>
      <WorkspaceSessionGuard>
        <LearningTasksProvider>
          <AppShell>{children}</AppShell>
        </LearningTasksProvider>
      </WorkspaceSessionGuard>
    </AuraConfigProvider>
  );
}

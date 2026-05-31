import { AppShell } from "@/components/aura/app-shell";
import { AuraConfigProvider } from "@/hooks/use-aura-config";
import { LearningTasksProvider } from "@/hooks/use-learning-tasks";

export default function WorkspaceLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <AuraConfigProvider>
      <LearningTasksProvider>
        <AppShell>{children}</AppShell>
      </LearningTasksProvider>
    </AuraConfigProvider>
  );
}

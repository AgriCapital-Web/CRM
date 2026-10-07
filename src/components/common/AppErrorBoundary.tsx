import React from "react";

type Props = { children: React.ReactNode };
type State = { hasError: boolean; message?: string };

export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : "Une erreur inattendue est survenue.",
    };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error("[AgriCapital] Runtime render error", error, info);
  }

  handleReload = () => {
    try {
      sessionStorage.setItem("agricapital_reload_after_error", String(Date.now()));
    } catch {
      // Ignore sessionStorage failures and continue with a normal reload.
    }
    window.location.assign(window.location.href);
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-6">
        <div className="w-full max-w-lg rounded-2xl border bg-card p-6 text-center shadow-lg">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive text-xl font-bold">!</div>
          <h1 className="text-xl font-bold text-foreground">AgriCapital a rencontré un problème</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            La page n'a pas pu être affichée correctement. Rechargez l'application. Si le problème persiste, contactez l'administrateur.
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            className="mt-5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            Recharger l'application
          </button>
          {import.meta.env.DEV && this.state.message && (
            <pre className="mt-4 overflow-auto rounded-lg bg-muted p-3 text-left text-xs">{this.state.message}</pre>
          )}
        </div>
      </div>
    );
  }
}

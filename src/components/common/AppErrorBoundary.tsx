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

  handleRetry = () => {
    this.setState({ hasError: false, message: undefined });
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-6">
        <div className="w-full max-w-lg rounded-2xl border bg-card p-6 text-center shadow-lg">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive text-xl font-bold">!</div>
          <h1 className="text-xl font-bold text-foreground">AgriCapital a rencontré un problème</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            La page n'a pas pu être affichée correctement. Réessayez l’affichage. Vos données restent conservées ; aucune actualisation complète ne sera lancée.
          </p>
          <button
            type="button"
            onClick={this.handleRetry}
            className="mt-5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            Réessayer l’affichage
          </button>
          {import.meta.env.DEV && this.state.message && (
            <pre className="mt-4 overflow-auto rounded-lg bg-muted p-3 text-left text-xs">{this.state.message}</pre>
          )}
        </div>
      </div>
    );
  }
}

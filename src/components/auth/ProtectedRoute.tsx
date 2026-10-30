import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: string;
  requiredPermission?: string;
  requiredPermissionCode?: string;
}

const ProtectedRoute = ({ children, requiredRole, requiredPermission, requiredPermissionCode }: ProtectedRouteProps) => {
  const { user, profile, loading, hasRole } = useAuth();
  const { can, loading: permissionsLoading } = usePermissions();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!loading && !permissionsLoading) {
      if (!user) {
        navigate('/login', { replace: true });
      } else if (profile?.password_change_required === true && location.pathname !== '/change-password-required') {
        navigate('/change-password-required', { replace: true });
      }
    }
  }, [user, profile?.password_change_required, location.pathname, loading, permissionsLoading, requiredRole, requiredPermission, requiredPermissionCode, navigate, hasRole, can ]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) return null;
  if (profile?.password_change_required === true && location.pathname !== '/change-password-required') return null;
  if (permissionsLoading) {
    return <div className="flex min-h-[50vh] items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" /></div>;
  }
  const accessDenied = Boolean(
    (requiredRole && !hasRole(requiredRole)) ||
    (requiredPermissionCode ? !can(requiredPermissionCode) : requiredPermission && !can(requiredPermission))
  );
  if (accessDenied) {
    return (
      <div className="flex min-h-[55vh] items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="space-y-3 p-6 text-center">
            <h1 className="text-lg font-semibold">Accès non autorisé</h1>
            <p className="text-sm text-muted-foreground">Votre compte ne dispose pas de l’autorisation nécessaire.</p>
            <Button onClick={() => navigate('/profil', { replace: true })}>Ouvrir mon profil</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;

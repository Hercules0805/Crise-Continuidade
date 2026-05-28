import { Request, Response, NextFunction } from 'express';
import { FirebaseAuthProvider } from '../../infrastructure/auth/FirebaseAuthProvider';
import { IConfigPerfilRepository } from '../../use-cases/interfaces/IConfigPerfilRepository';

// Public actions that don't require Firebase Auth
export const PUBLIC_ACTIONS = [
  'validarToken', 'validarTokenArea',
  'salvarRespostasToken', 'salvarRespostasArea'
];

export function createAuthMiddleware(
  authProvider: FirebaseAuthProvider,
  configPerfilRepository: IConfigPerfilRepository
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const action = req.query.action as string || req.body?.action;

    if (PUBLIC_ACTIONS.includes(action)) {
      return next();
    }

    // Also skip auth for health/ready endpoints
    if (req.path === '/health' || req.path === '/ready') {
      return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Token não fornecido' });
      return;
    }

    try {
      const idToken = authHeader.split('Bearer ')[1];
      const decoded = await authProvider.verifyIdToken(idToken);

      if (!decoded.email?.toLowerCase().endsWith('@fortestecnologia.com.br')) {
        res.status(403).json({ error: 'Domínio não autorizado' });
        return;
      }

      // Check if user exists in Config_Perfil
      const perfil = await configPerfilRepository.findByEmail(decoded.email);
      if (!perfil) {
        res.status(403).json({ error: 'Acesso negado' });
        return;
      }

      (req as any).userEmail = decoded.email;
      next();
    } catch (error) {
      res.status(401).json({ error: 'Token inválido' });
    }
  };
}

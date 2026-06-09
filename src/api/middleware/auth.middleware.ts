import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../../services/authService';

export interface AuthenticatedRequest extends Request {
  user?: { user_id: string; email: string };
}

export const authMiddleware = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token no proporcionado' });
    }

    const token = authHeader.substring(7);
    const decoded = AuthService.verifyToken(token);
    req.user = { user_id: decoded.user_id, email: decoded.email };
    next();
  } catch (error) {
    res.status(401).json({ error: 'Token inválido' });
  }
};

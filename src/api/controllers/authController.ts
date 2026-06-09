import { Response } from 'express';
import { AuthService } from '../../services/authService';
import { registerSchema, loginSchema } from '../validators/auth.validators';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

export class AuthController {
  static async register(req: AuthenticatedRequest, res: Response) {
    try {
      const data = registerSchema.parse(req.body);
      const { user, token } = await AuthService.register(data.email, data.password, data.nombre, data.telefono);
      res.status(201).json({ success: true, user, token });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async login(req: AuthenticatedRequest, res: Response) {
    try {
      const data = loginSchema.parse(req.body);
      const { user, token } = await AuthService.login(data.email, data.password);
      res.status(200).json({ success: true, user, token });
    } catch (error: any) {
      res.status(401).json({ success: false, error: error.message });
    }
  }

  static async getMe(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user) throw new Error('No autenticado');
      const user = await AuthService.getUserById(req.user.user_id);
      res.json({ success: true, user });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }
}

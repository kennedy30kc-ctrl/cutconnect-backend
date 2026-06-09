import bcryptjs from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { supabase } from '../database/supabaseClient';
import { User, JWTPayload } from '../types';

export class AuthService {
  static async register(email: string, password: string, nombre: string, telefono: string) {
    const passwordHash = await bcryptjs.hash(password, 10);

    const { data: user, error } = await supabase
      .from('users')
      .insert({
        email,
        nombre,
        telefono,
        contraseña_hash: passwordHash,
      })
      .select()
      .single();

    if (error) throw new Error('Error al registrar');

    const token = this.generateToken(user.user_id, user.email);
    return { user, token };
  }

  static async login(email: string, password: string) {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error) throw new Error('Email o contraseña incorrectos');

    const passwordMatch = await bcryptjs.compare(password, user.contraseña_hash);
    if (!passwordMatch) throw new Error('Email o contraseña incorrectos');

    const token = this.generateToken(user.user_id, user.email);
    return { user, token };
  }

  static generateToken(userId: string, email: string): string {
    return jwt.sign(
      { user_id: userId, email },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: process.env.JWT_EXPIRATION || '24h' }
    );
  }

  static verifyToken(token: string): JWTPayload {
    return jwt.verify(token, process.env.JWT_SECRET || 'secret') as JWTPayload;
  }

  static async getUserById(userId: string) {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) throw new Error('Usuario no encontrado');
    return user;
  }
}

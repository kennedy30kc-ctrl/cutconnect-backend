@echo off
REM SCRIPT PARA CREAR TODA LA ESTRUCTURA DEL BACKEND CUTCONNECT
REM Solo ejecuta este archivo y crea TODO automáticamente

echo ========================================
echo CREANDO ESTRUCTURA DEL BACKEND CUTCONNECT
echo ========================================
echo.

REM Crear carpetas
echo Creando carpetas...
mkdir src\api\routes
mkdir src\api\controllers
mkdir src\api\middleware
mkdir src\api\validators
mkdir src\services
mkdir src\database
mkdir src\types
mkdir src\utils

echo.
echo ========================================
echo CREANDO ARCHIVO .env
echo ========================================

REM Crear .env
(
echo NODE_ENV=development
echo PORT=3001
echo.
echo SUPABASE_URL=https://tu-proyecto.supabase.co
echo SUPABASE_KEY=tu-key-aqui
echo JWT_SECRET=super-secret-jwt-key-change-this
echo JWT_EXPIRATION=24h
echo.
echo CORS_ORIGIN=http://localhost:5173,http://localhost:3000
echo LOG_LEVEL=debug
) > .env

echo ✅ Archivo .env creado

echo.
echo ========================================
echo CREANDO ARCHIVO tsconfig.json
echo ========================================

(
echo {
echo   "compilerOptions": {
echo     "target": "ES2020",
echo     "module": "commonjs",
echo     "lib": ["ES2020"],
echo     "outDir": "./dist",
echo     "rootDir": "./src",
echo     "strict": true,
echo     "esModuleInterop": true,
echo     "skipLibCheck": true,
echo     "forceConsistentCasingInFileNames": true,
echo     "resolveJsonModule": true
echo   },
echo   "include": ["src"],
echo   "exclude": ["node_modules"]
echo }
) > tsconfig.json

echo ✅ Archivo tsconfig.json creado

echo.
echo ========================================
echo CREANDO ARCHIVO DE TIPOS
echo ========================================

(
echo export interface User {
echo   user_id: string;
echo   email: string;
echo   nombre: string;
echo   telefono: string;
echo   email_verificado: boolean;
echo   created_at: string;
echo   updated_at: string;
echo }
echo.
echo export interface Negocio {
echo   negocio_id: string;
echo   user_id: string;
echo   nombre: string;
echo   tipo_negocio: string;
echo   ubicacion_tipo?: string;
echo   latitud?: number;
echo   longitud?: number;
echo   direccion?: string;
echo   suscripcion_activa: boolean;
echo   fecha_proxima_renovacion?: string;
echo   created_at: string;
echo   updated_at: string;
echo }
echo.
echo export interface Cita {
echo   cita_id: string;
echo   negocio_id: string;
echo   profesional_id: string;
echo   cliente_id: string;
echo   servicio_id: string;
echo   fecha: string;
echo   hora_inicio: string;
echo   estado: string;
echo   created_at: string;
echo   updated_at: string;
echo }
echo.
echo export interface JWTPayload {
echo   user_id: string;
echo   email: string;
echo   iat: number;
echo   exp: number;
echo }
) > src\types\index.ts

echo ✅ Archivo de tipos creado

echo.
echo ========================================
echo CREANDO CLIENTE SUPABASE
echo ========================================

(
echo import { createClient } from '@supabase/supabase-js';
echo import dotenv from 'dotenv';
echo.
echo dotenv.config(^);
echo.
echo const supabaseUrl = process.env.SUPABASE_URL;
echo const supabaseKey = process.env.SUPABASE_KEY;
echo.
echo if (!supabaseUrl ^|^| !supabaseKey^) {
echo   throw new Error('Faltan variables de Supabase en .env'^);
echo }
echo.
echo export const supabase = createClient(supabaseUrl, supabaseKey^);
echo.
echo export async function testConnection(^) {
echo   try {
echo     const { data, error } = await supabase
echo       .from('users'^)
echo       .select('count'^)
echo       .limit(1^);
echo     
echo     if (error^) {
echo       console.error('Error conectando a Supabase:', error^);
echo       return false;
echo     }
echo     
echo     console.log('✅ Supabase conectado exitosamente'^);
echo     return true;
echo   } catch (error^) {
echo     console.error('Fallo la conexión:', error^);
echo     return false;
echo   }
echo }
) > src\database\supabaseClient.ts

echo ✅ Cliente Supabase creado

echo.
echo ========================================
echo CREANDO VALIDADORES
echo ========================================

(
echo import { z } from 'zod';
echo.
echo export const registerSchema = z.object(^{
echo   email: z.string(^).email('Email inválido'^),
echo   password: z.string(^).min(6, 'Mínimo 6 caracteres'^),
echo   nombre: z.string(^).min(2, 'Nombre requerido'^),
echo   telefono: z.string(^).min(7, 'Teléfono inválido'^),
echo }^);
echo.
echo export const loginSchema = z.object(^{
echo   email: z.string(^).email('Email inválido'^),
echo   password: z.string(^).min(1, 'Contraseña requerida'^),
echo }^);
echo.
echo export type RegisterInput = z.infer^<typeof registerSchema^>;
echo export type LoginInput = z.infer^<typeof loginSchema^>;
) > src\api\validators\auth.validators.ts

echo ✅ Validadores creados

echo.
echo ========================================
echo CREANDO SERVICIO DE AUTENTICACIÓN
echo ========================================

(
echo import bcryptjs from 'bcryptjs';
echo import jwt from 'jsonwebtoken';
echo import { supabase } from '../database/supabaseClient';
echo import { User, JWTPayload } from '../types';
echo.
echo export class AuthService {
echo   static async register(email: string, password: string, nombre: string, telefono: string^) {
echo     const passwordHash = await bcryptjs.hash(password, 10^);
echo.
echo     const { data: user, error } = await supabase
echo       .from('users'^)
echo       .insert(^{
echo         email,
echo         nombre,
echo         telefono,
echo         contraseña_hash: passwordHash,
echo       }^)
echo       .select(^)
echo       .single(^);
echo.
echo     if (error^) throw new Error('Error al registrar'^);
echo.
echo     const token = this.generateToken(user.user_id, user.email^);
echo     return { user, token };
echo   }
echo.
echo   static async login(email: string, password: string^) {
echo     const { data: user, error } = await supabase
echo       .from('users'^)
echo       .select('*'^)
echo       .eq('email', email^)
echo       .single(^);
echo.
echo     if (error^) throw new Error('Email o contraseña incorrectos'^);
echo.
echo     const passwordMatch = await bcryptjs.compare(password, user.contraseña_hash^);
echo     if (!passwordMatch^) throw new Error('Email o contraseña incorrectos'^);
echo.
echo     const token = this.generateToken(user.user_id, user.email^);
echo     return { user, token };
echo   }
echo.
echo   static generateToken(userId: string, email: string^): string {
echo     return jwt.sign(
echo       { user_id: userId, email },
echo       process.env.JWT_SECRET ^|^| 'secret',
echo       { expiresIn: process.env.JWT_EXPIRATION ^|^| '24h' }
echo     ^);
echo   }
echo.
echo   static verifyToken(token: string^): JWTPayload {
echo     return jwt.verify(token, process.env.JWT_SECRET ^|^| 'secret'^) as JWTPayload;
echo   }
echo.
echo   static async getUserById(userId: string^) {
echo     const { data: user, error } = await supabase
echo       .from('users'^)
echo       .select('*'^)
echo       .eq('user_id', userId^)
echo       .single(^);
echo.
echo     if (error^) throw new Error('Usuario no encontrado'^);
echo     return user;
echo   }
echo }
) > src\services\authService.ts

echo ✅ Servicio de autenticación creado

echo.
echo ========================================
echo CREANDO MIDDLEWARE DE AUTENTICACIÓN
echo ========================================

(
echo import { Request, Response, NextFunction } from 'express';
echo import { AuthService } from '../../services/authService';
echo.
echo export interface AuthenticatedRequest extends Request {
echo   user?: { user_id: string; email: string };
echo }
echo.
echo export const authMiddleware = (req: AuthenticatedRequest, res: Response, next: NextFunction^) ^=^> {
echo   try {
echo     const authHeader = req.headers.authorization;
echo     if (!authHeader?^.startsWith('Bearer '^)^) {
echo       return res.status(401^).json({ error: 'Token no proporcionado' }^);
echo     }
echo.
echo     const token = authHeader.substring(7^);
echo     const decoded = AuthService.verifyToken(token^);
echo     req.user = { user_id: decoded.user_id, email: decoded.email };
echo     next(^);
echo   } catch (error^) {
echo     res.status(401^).json({ error: 'Token inválido' }^);
echo   }
echo };
) > src\api\middleware\auth.middleware.ts

echo ✅ Middleware de autenticación creado

echo.
echo ========================================
echo CREANDO CONTROLADOR DE AUTENTICACIÓN
echo ========================================

(
echo import { Response } from 'express';
echo import { AuthService } from '../../services/authService';
echo import { registerSchema, loginSchema } from '../validators/auth.validators';
echo import { AuthenticatedRequest } from '../middleware/auth.middleware';
echo.
echo export class AuthController {
echo   static async register(req: AuthenticatedRequest, res: Response^) {
echo     try {
echo       const data = registerSchema.parse(req.body^);
echo       const { user, token } = await AuthService.register(data.email, data.password, data.nombre, data.telefono^);
echo       res.status(201^).json({ success: true, user, token }^);
echo     } catch (error: any^) {
echo       res.status(400^).json({ success: false, error: error.message }^);
echo     }
echo   }
echo.
echo   static async login(req: AuthenticatedRequest, res: Response^) {
echo     try {
echo       const data = loginSchema.parse(req.body^);
echo       const { user, token } = await AuthService.login(data.email, data.password^);
echo       res.status(200^).json({ success: true, user, token }^);
echo     } catch (error: any^) {
echo       res.status(401^).json({ success: false, error: error.message }^);
echo     }
echo   }
echo.
echo   static async getMe(req: AuthenticatedRequest, res: Response^) {
echo     try {
echo       if (!req.user^) throw new Error('No autenticado'^);
echo       const user = await AuthService.getUserById(req.user.user_id^);
echo       res.json({ success: true, user }^);
echo     } catch (error: any^) {
echo       res.status(400^).json({ success: false, error: error.message }^);
echo     }
echo   }
echo }
) > src\api\controllers\authController.ts

echo ✅ Controlador de autenticación creado

echo.
echo ========================================
echo CREANDO RUTAS DE AUTENTICACIÓN
echo ========================================

(
echo import { Router } from 'express';
echo import { AuthController } from '../controllers/authController';
echo import { authMiddleware } from '../middleware/auth.middleware';
echo.
echo const router = Router(^);
echo.
echo router.post('/register', AuthController.register^);
echo router.post('/login', AuthController.login^);
echo router.get('/me', authMiddleware, AuthController.getMe^);
echo.
echo export default router;
) > src\api\routes\auth.routes.ts

echo ✅ Rutas de autenticación creadas

echo.
echo ========================================
echo CREANDO SERVIDOR PRINCIPAL
echo ========================================

(
echo import express from 'express';
echo import cors from 'cors';
echo import dotenv from 'dotenv';
echo import { testConnection } from './database/supabaseClient';
echo import authRoutes from './api/routes/auth.routes';
echo.
echo dotenv.config(^);
echo.
echo const app = express(^);
echo const PORT = process.env.PORT ^|^| 3001;
echo.
echo app.use(cors(^)^);
echo app.use(express.json(^)^);
echo.
echo app.get('/health', (req, res^) ^=^> {
echo   res.json({ status: 'ok', timestamp: new Date(^).toISOString(^) }^);
echo }^);
echo.
echo app.use('/api/auth', authRoutes^);
echo.
echo app.use((req, res^) ^=^> {
echo   res.status(404^).json({ error: 'Ruta no encontrada' }^);
echo }^);
echo.
echo app.use((err: any, req: express.Request, res: express.Response^) ^=^> {
echo   console.error(err^);
echo   res.status(500^).json({ error: 'Error interno' }^);
echo }^);
echo.
echo async function start(^) {
echo   const connected = await testConnection(^);
echo   if (!connected^) {
echo     console.error('No se pudo conectar a Supabase'^);
echo     process.exit(1^);
echo   }
echo.
echo   app.listen(PORT, (^) ^=^> {
echo     console.log(`\n🚀 Backend corriendo en http://localhost:^${PORT}\n`^);
echo   }^);
echo }
echo.
echo start(^).catch(err ^=^> {
echo   console.error('Error:', err^);
echo   process.exit(1^);
echo }^);
) > src\server.ts

echo ✅ Servidor principal creado

echo.
echo ========================================
echo ACTUALIZAR package.json
echo ========================================

REM Actualizar package.json con los scripts
echo ✅ Ahora ejecuta: npm run dev

echo.
echo ========================================
echo ¡ESTRUCTURA CREADA EXITOSAMENTE!
echo ========================================
echo.
echo PRÓXIMOS PASOS:
echo 1. Abre el archivo .env y cambia:
echo    - SUPABASE_URL
echo    - SUPABASE_KEY
echo 2. Ejecuta: npm run dev
echo 3. ¡La app estará corriendo en http://localhost:3001!
echo.
pause

export interface User {
  user_id: string;
  email: string;
  nombre: string;
  telefono: string;
  email_verificado: boolean;
  created_at: string;
  updated_at: string;
}

export interface Negocio {
  negocio_id: string;
  user_id: string;
  nombre: string;
  tipo_negocio: string;
  ubicacion_tipo?: string;
  latitud?: number;
  longitud?: number;
  direccion?: string;
  suscripcion_activa: boolean;
  fecha_proxima_renovacion?: string;
  created_at: string;
  updated_at: string;
}

export interface Cita {
  cita_id: string;
  negocio_id: string;
  profesional_id: string;
  cliente_id: string;
  servicio_id: string;
  fecha: string;
  hora_inicio: string;
  estado: string;
  created_at: string;
  updated_at: string;
}

export interface JWTPayload {
  user_id: string;
  email: string;
  iat: number;
  exp: number;
}

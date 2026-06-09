import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Faltan variables de Supabase en .env');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

export async function testConnection() {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('count')
      .limit(1);
ECHO est  desactivado.
    if (error) {
      console.error('Error conectando a Supabase:', error);
      return false;
    }
ECHO est  desactivado.
    console.log('âœ… Supabase conectado exitosamente');
    return true;
  } catch (error) {
    console.error('Fallo la conexiÃ³n:', error);
    return false;
  }
}

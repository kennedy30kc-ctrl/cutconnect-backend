const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());

const SUPABASE_URL = 'https://mypcsegsvarcwyigzodc.supabase.co';
const SUPABASE_KEY = 'sb_secret_xs3NNf9uRMfySfM2DIodsA_ulpWE2OS';
const ADMIN_PASSWORD = 'CutConnect2024Admin!';

const headers = {
  'Content-Type': 'application/json',
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`
};

// Helper para consultas a Supabase
async function sb(tabla, options = {}) {
  const { method = 'GET', filters = '', body = null, select = '*' } = options;
  let url = `${SUPABASE_URL}/rest/v1/${tabla}?select=${select}${filters}`;
  const config = { method, headers: { ...headers } };
  if (body) {
    config.body = JSON.stringify(body);
    config.headers['Content-Type'] = 'application/json';
    config.headers['Prefer'] = method === 'POST' ? 'return=representation' : 'return=representation';
  }
  const res = await fetch(url, config);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
  return res.json();
}

async function sbInsert(tabla, body) {
  const url = `${SUPABASE_URL}/rest/v1/${tabla}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...headers, 'Prefer': 'return=representation' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return Array.isArray(data) ? data[0] : data;
}

async function sbUpdate(tabla, filters, body) {
  const url = `${SUPABASE_URL}/rest/v1/${tabla}?${filters}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { ...headers, 'Prefer': 'return=representation' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function calcularDistancia(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ============================================================
// AUTH - REGISTRO
// ============================================================
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, nombre, telefono, rol, negocio_nombre, ciudad, pais, estado, municipio, negocio_telefono, negocio_logo, negocio_descripcion, direccion, latitud, longitud } = req.body;

    if (!email || !password || !rol) return res.status(400).json({ success: false, error: 'Email, contraseña y rol requeridos' });

    const existing = await sb('usuarios', { filters: `&email=eq.${encodeURIComponent(email)}` });
    if (existing.length > 0) return res.status(400).json({ success: false, error: 'El email ya está registrado' });

    if (rol === 'dueño' && (!negocio_nombre || !ciudad || !negocio_telefono || !direccion || !latitud || !longitud)) {
      return res.status(400).json({ success: false, error: 'Completa todos los datos del negocio' });
    }

    const usuario = await sbInsert('usuarios', {
      email, password,
      nombre: nombre || email.split('@')[0],
      telefono: telefono || '',
      rol,
      estado_verificacion: rol === 'dueño' ? 'pendiente' : 'aprobado'
    });

    if (rol === 'dueño') {
      await sbInsert('barberias', {
        dueno_id: usuario.id,
        nombre: negocio_nombre,
        ciudad, pais: pais || '', estado: estado || '',
        municipio: municipio || '', telefono: negocio_telefono,
        logo: negocio_logo || null, descripcion: negocio_descripcion || '',
        direccion, latitud: parseFloat(latitud), longitud: parseFloat(longitud),
        estado_verificacion: 'pendiente'
      });
    }

    res.status(201).json({
      success: true,
      user: { ...usuario, password: undefined },
      token: 'token_' + usuario.id,
      mensaje: rol === 'dueño' ? 'Registrado. Pendiente de aprobación.' : 'Registrado exitosamente'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// AUTH - LOGIN
// ============================================================
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, error: 'Email y contraseña requeridos' });

    const usuarios = await sb('usuarios', { filters: `&email=eq.${encodeURIComponent(email)}&password=eq.${encodeURIComponent(password)}` });
    if (usuarios.length === 0) return res.status(401).json({ success: false, error: 'Email o contraseña incorrectos' });

    const usuario = usuarios[0];

    if (usuario.rol === 'dueño') {
      const barberias = await sb('barberias', { filters: `&dueno_id=eq.${usuario.id}` });
      if (barberias.length > 0) {
        usuario.negocio_nombre = barberias[0].nombre;
        usuario.ciudad = barberias[0].ciudad;
        usuario.estado = barberias[0].estado;
        usuario.negocio_telefono = barberias[0].telefono;
        usuario.negocio_logo = barberias[0].logo;
        usuario.fecha_trial_inicio = barberias[0].fecha_trial_inicio;
        usuario.estado_verificacion = barberias[0].estado_verificacion;
      }
    }

    res.json({ success: true, user: { ...usuario, password: undefined }, token: 'token_' + usuario.id });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// AUTH - RECUPERAR CONTRASEÑA
// ============================================================
app.post('/api/auth/recuperar-contrasena', async (req, res) => {
  try {
    const { email, nueva_contrasena } = req.body;
    const usuarios = await sb('usuarios', { filters: `&email=eq.${encodeURIComponent(email)}` });
    if (usuarios.length === 0) return res.status(404).json({ success: false, error: 'Email no registrado' });
    await sbUpdate('usuarios', `id=eq.${usuarios[0].id}`, { password: nueva_contrasena });
    res.json({ success: true, message: 'Contraseña actualizada' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// BARBERÍAS - GET PÚBLICO
// ============================================================
app.get('/api/barberias', async (req, res) => {
  try {
    const { lat, lon, ciudad } = req.query;
    let filters = `&estado_verificacion=in.(activo,trial)`;
    if (ciudad) filters += `&or=(ciudad.ilike.*${ciudad}*,municipio.ilike.*${ciudad}*)`;

    let barberias = await sb('barberias', { filters });

    if (lat && lon) {
      barberias = barberias
        .map(b => ({ ...b, distancia: calcularDistancia(parseFloat(lat), parseFloat(lon), b.latitud, b.longitud) }))
        .sort((a, b) => a.distancia - b.distancia);
    }

    res.json({ success: true, data: barberias });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// SERVICIOS
// ============================================================
app.get('/api/servicios', async (req, res) => {
  try {
    const servicios = await sb('servicios');
    res.json({ success: true, data: servicios });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// BARBEROS - GET POR BARBERÍA
// ============================================================
app.get('/api/barberos/:barberiaId', async (req, res) => {
  try {
    const barberos = await sb('barberos', { filters: `&barberia_id=eq.${req.params.barberiaId}&activo=eq.true` });
    res.json({ success: true, data: barberos });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// BARBEROS - AGREGAR
// ============================================================
app.post('/api/barberos', async (req, res) => {
  try {
    const { barberia_id, nombre, foto, especialidad, horario } = req.body;
    if (!barberia_id || !nombre) return res.status(400).json({ success: false, error: 'Barbería y nombre requeridos' });
    const barbero = await sbInsert('barberos', { barberia_id, nombre, foto: foto || null, especialidad: especialidad || 'Cortes generales', horario: horario || null });
    res.status(201).json({ success: true, data: barbero });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// BARBEROS - ACTUALIZAR
// ============================================================
app.put('/api/barberos/:id', async (req, res) => {
  try {
    const { nombre, foto, especialidad, horario, activo } = req.body;
    const updated = await sbUpdate('barberos', `id=eq.${req.params.id}`, { nombre, foto, especialidad, horario, activo });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// BARBEROS - DESACTIVAR
// ============================================================
app.delete('/api/barberos/:id', async (req, res) => {
  try {
    await sbUpdate('barberos', `id=eq.${req.params.id}`, { activo: false });
    res.json({ success: true, message: 'Barbero desactivado' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// DISPONIBILIDAD
// ============================================================
app.get('/api/disponibilidad/:barberoId/:fecha', async (req, res) => {
  try {
    const { barberoId, fecha } = req.params;
    const barberos = await sb('barberos', { filters: `&id=eq.${barberoId}` });
    if (barberos.length === 0) return res.status(404).json({ success: false, error: 'Barbero no encontrado' });

    const barbero = barberos[0];
    const dias = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];
    const fechaObj = new Date(fecha + 'T12:00:00');
    const diaSemana = dias[fechaObj.getDay()];
    const horarioDia = barbero.horario[diaSemana];

    if (!horarioDia || !horarioDia.activo) return res.json({ success: true, data: [], mensaje: 'No trabaja ese día' });

    const slots = [];
    const [hI, mI] = horarioDia.inicio.split(':').map(Number);
    const [hF, mF] = horarioDia.fin.split(':').map(Number);
    let actual = hI * 60 + mI;
    const fin = hF * 60 + mF;
    while (actual < fin) {
      const h = Math.floor(actual/60).toString().padStart(2,'0');
      const m = (actual%60).toString().padStart(2,'0');
      slots.push(`${h}:${m}`);
      actual += 30;
    }

    const citasOcupadas = await sb('citas', { filters: `&barbero_id=eq.${barberoId}&fecha=eq.${fecha}&estado=neq.cancelada`, select: 'hora' });
    const horasOcupadas = citasOcupadas.map((c) => c.hora);
    const disponibles = slots.filter(s => !horasOcupadas.includes(s));

    res.json({ success: true, data: disponibles });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// CITAS - AGENDAR
// ============================================================
app.post('/api/citas/agendar', async (req, res) => {
  try {
    const { barberia_id, barbero_id, servicio_id, fecha, hora, usuario_id } = req.body;
    if (!barberia_id || !servicio_id || !fecha || !hora) return res.status(400).json({ success: false, error: 'Todos los campos son requeridos' });

    if (barbero_id) {
      const ocupada = await sb('citas', { filters: `&barbero_id=eq.${barbero_id}&fecha=eq.${fecha}&hora=eq.${hora}&estado=neq.cancelada` });
      if (ocupada.length > 0) return res.status(400).json({ success: false, error: 'Esa hora ya está ocupada' });
    }

    const cita = await sbInsert('citas', { usuario_id, barberia_id, barbero_id: barbero_id || null, servicio_id, fecha, hora, estado: 'agendada' });
    res.status(201).json({ success: true, message: 'Cita agendada', cita });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// CITAS - GET POR USUARIO
// ============================================================
app.get('/api/citas/usuario/:usuarioId', async (req, res) => {
  try {
    const citas = await sb('citas', {
      filters: `&usuario_id=eq.${req.params.usuarioId}`,
      select: '*,barberia:barberias(*),barbero:barberos(*),servicio:servicios(*)'
    });
    res.json({ success: true, data: citas });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// ADMIN
// ============================================================
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) res.json({ success: true, token: 'admin_token_cutconnect' });
  else res.status(401).json({ success: false, error: 'Contraseña incorrecta' });
});

function adminAuth(req, res, next) {
  if (req.headers['x-admin-token'] === 'admin_token_cutconnect') return next();
  res.status(401).json({ success: false, error: 'No autorizado' });
}

app.get('/api/admin/negocios', adminAuth, async (req, res) => {
  try {
    const negocios = await sb('barberias', { select: '*,dueno:usuarios(email,nombre)' });
    const result = negocios.map(n => ({
      ...n,
      email_dueno: n.dueno?.email,
      diasTrial: n.estado_verificacion === 'trial' && n.fecha_trial_inicio
        ? Math.ceil(14 - (Date.now() - new Date(n.fecha_trial_inicio).getTime()) / (1000*60*60*24))
        : null
    }));
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/aprobar/:id', adminAuth, async (req, res) => {
  try {
    await sbUpdate('barberias', `id=eq.${req.params.id}`, { estado_verificacion: 'trial', fecha_trial_inicio: new Date().toISOString() });
    await sbUpdate('usuarios', `id=eq.${req.params.id}`, { estado_verificacion: 'trial', fecha_trial_inicio: new Date().toISOString() });
    res.json({ success: true, message: 'Negocio aprobado. Trial de 14 días iniciado.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/rechazar/:id', adminAuth, async (req, res) => {
  try {
    await sbUpdate('barberias', `id=eq.${req.params.id}`, { estado_verificacion: 'rechazado' });
    await sbUpdate('usuarios', `id=eq.${req.params.id}`, { estado_verificacion: 'rechazado' });
    res.json({ success: true, message: 'Negocio rechazado.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/activar/:id', adminAuth, async (req, res) => {
  try {
    await sbUpdate('barberias', `id=eq.${req.params.id}`, { estado_verificacion: 'activo' });
    await sbUpdate('usuarios', `id=eq.${req.params.id}`, { estado_verificacion: 'activo' });
    res.json({ success: true, message: 'Negocio activado.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/suspender/:id', adminAuth, async (req, res) => {
  try {
    await sbUpdate('barberias', `id=eq.${req.params.id}`, { estado_verificacion: 'suspendido' });
    await sbUpdate('usuarios', `id=eq.${req.params.id}`, { estado_verificacion: 'suspendido' });
    res.json({ success: true, message: 'Negocio suspendido.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/admin/stats', adminAuth, async (req, res) => {
  try {
    const barberias = await sb('barberias', { select: 'estado_verificacion' });
    const clientes = await sb('usuarios', { filters: `&rol=eq.cliente`, select: 'id' });
    const citas = await sb('citas', { select: 'id' });
    res.json({ success: true, data: {
      total: barberias.length,
      pendientes: barberias.filter(b => b.estado_verificacion === 'pendiente').length,
      trial: barberias.filter(b => b.estado_verificacion === 'trial').length,
      activos: barberias.filter(b => b.estado_verificacion === 'activo').length,
      suspendidos: barberias.filter(b => b.estado_verificacion === 'suspendido').length,
      rechazados: barberias.filter(b => b.estado_verificacion === 'rechazado').length,
      total_citas: citas.length,
      total_clientes: clientes.length
    }});
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
// CITAS POR BARBERÍA (para el dueño)
app.get('/api/citas/barberia/:barberiaId', async (req, res) => {
  try {
    const citas = await sb('citas', {
      filters: `&barberia_id=eq.${req.params.barberiaId}`,
      select: '*,barbero:barberos(*),servicio:servicios(*),cliente:usuarios(nombre,email,telefono)'
    });
    res.json({ success: true, data: citas });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(3001, () => {
  console.log('\n🚀 CutConnect Backend corriendo en http://localhost:3001');
  console.log('🗄️  Conectado a Supabase ✅\n');
});
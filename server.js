const express = require('express');
const cors = require('cors');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const app = express();

app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const SUPABASE_URL = 'https://mypcsegsvarcwyigzodc.supabase.co';
const SUPABASE_KEY = 'sb_secret_xs3NNf9uRMfySfM2DIodsA_ulpWE2OS';
const ADMIN_PASSWORD = 'KenLiNohe.1';
const BUCKET = 'imagenes-cutconnect';

const headers = {
  'Content-Type': 'application/json',
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`
};

// Control de intentos de login (máximo 5 por email)
const loginIntentos = {};
function verificarIntentos(email) {
  const ahora = Date.now();
  if (!loginIntentos[email]) loginIntentos[email] = { count: 0, bloqueadoHasta: 0 };
  const intentos = loginIntentos[email];
  if (intentos.bloqueadoHasta > ahora) {
    const minutosRestantes = Math.ceil((intentos.bloqueadoHasta - ahora) / 60000);
    return { bloqueado: true, minutosRestantes };
  }
  return { bloqueado: false };
}
function registrarIntento(email, exitoso) {
  if (!loginIntentos[email]) loginIntentos[email] = { count: 0, bloqueadoHasta: 0 };
  if (exitoso) { loginIntentos[email] = { count: 0, bloqueadoHasta: 0 }; return; }
  loginIntentos[email].count++;
  if (loginIntentos[email].count >= 5) {
    loginIntentos[email].bloqueadoHasta = Date.now() + 15 * 60 * 1000; // 15 minutos
    loginIntentos[email].count = 0;
  }
}

function generarCodigo() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sb(tabla, options = {}) {
  const { method = 'GET', filters = '', body = null, select = '*' } = options;
  let url = `${SUPABASE_URL}/rest/v1/${tabla}?select=${select}${filters}`;
  const config = { method, headers: { ...headers } };
  if (body) {
    config.body = JSON.stringify(body);
    config.headers['Prefer'] = 'return=representation';
  }
  const res = await fetch(url, config);
  if (!res.ok) throw new Error(await res.text());
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

async function subirImagen(buffer, mimetype, carpeta, nombreArchivo) {
  const path = `${carpeta}/${nombreArchivo}`;
  const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': mimetype,
      'x-upsert': 'true'
    },
    body: buffer
  });
  if (!res.ok) throw new Error(await res.text());
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

async function recalcularCalificacionBarbero(barberoId) {
  const cals = await sb('calificaciones', { filters: `&barbero_id=eq.${barberoId}`, select: 'estrellas' });
  if (cals.length === 0) return;
  const promedio = cals.reduce((a, c) => a + c.estrellas, 0) / cals.length;
  await sbUpdate('barberos', `id=eq.${barberoId}`, { calificacion_promedio: promedio.toFixed(2) });
}

async function recalcularCalificacionBarberia(barberiaId) {
  const cals = await sb('calificaciones', { filters: `&barberia_id=eq.${barberiaId}&barbero_id=is.null`, select: 'estrellas' });
  if (cals.length === 0) return;
  const promedio = cals.reduce((a, c) => a + c.estrellas, 0) / cals.length;
  await sbUpdate('barberias', `id=eq.${barberiaId}`, { calificacion_promedio: promedio.toFixed(2) });
}

function calcularDistancia(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

async function enviarWhatsApp(telefono, mensaje) {
  try {
    const numero = telefono.replace(/\D/g, '');
    const res = await fetch('https://api.fonnte.com/send', {
      method: 'POST',
      headers: { 'Authorization': 'QXY8QZZ1' },
      body: new URLSearchParams({ target: numero, message: mensaje, countryCode: '57' })
    });
    const data = await res.json();
    console.log('WhatsApp enviado:', data);
  } catch (err) {
    console.log('Error WhatsApp:', err.message);
  }
}

// ============================================================
// SUBIDA DE IMÁGENES
// ============================================================
app.post('/api/upload/logo/:barberiaId', upload.single('imagen'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No se recibió imagen' });
    const ext = req.file.mimetype.split('/')[1];
    const nombre = `logo_${req.params.barberiaId}_${Date.now()}.${ext}`;
    const url = await subirImagen(req.file.buffer, req.file.mimetype, 'logos', nombre);
    await sbUpdate('barberias', `id=eq.${req.params.barberiaId}`, { logo: url });
    res.json({ success: true, url });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/upload/barbero/:barberoId', upload.single('imagen'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No se recibió imagen' });
    const ext = req.file.mimetype.split('/')[1];
    const nombre = `barbero_${req.params.barberoId}_${Date.now()}.${ext}`;
    const url = await subirImagen(req.file.buffer, req.file.mimetype, 'barberos', nombre);
    await sbUpdate('barberos', `id=eq.${req.params.barberoId}`, { foto: url });
    res.json({ success: true, url });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/upload/anuncio/:id', upload.single('imagen'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No se recibió imagen' });
    const ext = req.file.mimetype.split('/')[1];
    const nombre = `anuncio_${Date.now()}.${ext}`;
    const url = await subirImagen(req.file.buffer, req.file.mimetype, 'anuncios', nombre);
    res.json({ success: true, url });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ============================================================
// CALIFICACIONES
// ============================================================
app.post('/api/calificaciones', async (req, res) => {
  try {
    const { usuario_id, barberia_id, barbero_id, estrellas, comentario } = req.body;
    if (!usuario_id || !barberia_id || !estrellas) return res.status(400).json({ success: false, error: 'Datos incompletos' });
    const cal = await sbInsert('calificaciones', { usuario_id, barberia_id, barbero_id: barbero_id || null, estrellas, comentario: comentario || '' });
    if (barbero_id) await recalcularCalificacionBarbero(barbero_id);
    else await recalcularCalificacionBarberia(barberia_id);
    res.status(201).json({ success: true, data: cal });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/calificaciones/barberia/:barberiaId', async (req, res) => {
  try {
    const cals = await sb('calificaciones', { filters: `&barberia_id=eq.${req.params.barberiaId}&barbero_id=is.null&order=fecha.desc`, select: '*,usuario:usuarios(nombre)' });
    res.json({ success: true, data: cals });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/calificaciones/barbero/:barberoId', async (req, res) => {
  try {
    const cals = await sb('calificaciones', { filters: `&barbero_id=eq.${req.params.barberoId}&order=fecha.desc`, select: '*,usuario:usuarios(nombre)' });
    res.json({ success: true, data: cals });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ============================================================
// AUTH
// ============================================================
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, nombre, telefono, rol, pais, negocio_nombre, ciudad, estado, municipio, tipo_negocio, negocio_telefono, negocio_logo, negocio_descripcion, direccion, latitud, longitud, codigo_invitacion } = req.body;
    if (!email || !password || !rol) return res.status(400).json({ success: false, error: 'Email, contraseña y rol requeridos' });
    if (password.length < 6) return res.status(400).json({ success: false, error: 'La contraseña debe tener al menos 6 caracteres' });
    const existing = await sb('usuarios', { filters: `&email=eq.${encodeURIComponent(email)}` });
    if (existing.length > 0) return res.status(400).json({ success: false, error: 'El email ya está registrado' });
    if (rol === 'dueño' && (!negocio_nombre || !ciudad || !negocio_telefono || !direccion || !latitud || !longitud)) return res.status(400).json({ success: false, error: 'Completa todos los datos del negocio' });
    let barberoVinculado = null;
    if (rol === 'barbero' && codigo_invitacion) {
      const barberos = await sb('barberos', { filters: `&codigo_invitacion=eq.${codigo_invitacion}` });
      if (barberos.length === 0) return res.status(400).json({ success: false, error: 'Código de invitación inválido' });
      if (barberos[0].usuario_id) return res.status(400).json({ success: false, error: 'Este código ya fue usado' });
      barberoVinculado = barberos[0];
    }
    // Encriptar contraseña
    const passwordHash = await bcrypt.hash(password, 10);
    const usuario = await sbInsert('usuarios', { email, password: passwordHash, nombre: nombre || email.split('@')[0], telefono: telefono || '', rol, pais: pais || 'Colombia', estado_verificacion: rol === 'dueño' ? 'pendiente' : 'aprobado' });
    if (rol === 'dueño') {
      await sbInsert('barberias', { dueno_id: usuario.id, nombre: negocio_nombre, tipo_negocio: tipo_negocio || 'barberia', ciudad, pais: pais || 'Colombia', estado: estado || '', municipio: municipio || '', telefono: negocio_telefono, logo: negocio_logo || null, descripcion: negocio_descripcion || '', direccion, latitud: parseFloat(latitud), longitud: parseFloat(longitud), estado_verificacion: 'pendiente' });
    }
    if (barberoVinculado) {
      await sbUpdate('barberos', `id=eq.${barberoVinculado.id}`, { usuario_id: usuario.id, nombre: nombre || usuario.nombre });
      usuario.barbero_id = barberoVinculado.id;
      usuario.barberia_id = barberoVinculado.barberia_id;
    }
    res.status(201).json({ success: true, user: { ...usuario, password: undefined }, token: 'token_' + usuario.id, mensaje: rol === 'dueño' ? 'Registrado. Pendiente de aprobación.' : 'Registrado exitosamente' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, error: 'Email y contraseña requeridos' });

    // Verificar bloqueo por intentos
    const intentos = verificarIntentos(email);
    if (intentos.bloqueado) return res.status(429).json({ success: false, error: `Demasiados intentos fallidos. Intenta de nuevo en ${intentos.minutosRestantes} minutos.` });

    const usuarios = await sb('usuarios', { filters: `&email=eq.${encodeURIComponent(email)}`, select: '*' });
    if (usuarios.length === 0) { registrarIntento(email, false); return res.status(401).json({ success: false, error: 'Email o contraseña incorrectos' }); }

    const usuario = usuarios[0];

    // Verificar contraseña (soporta tanto hash como texto plano para usuarios existentes)
    let passwordValida = false;
    if (usuario.password && usuario.password.startsWith('$2')) {
      passwordValida = await bcrypt.compare(password, usuario.password);
    } else {
      passwordValida = usuario.password === password;
      // Migrar a hash si coincide
      if (passwordValida) {
        const nuevoHash = await bcrypt.hash(password, 10);
        await sbUpdate('usuarios', `id=eq.${usuario.id}`, { password: nuevoHash });
      }
    }

    if (!passwordValida) { registrarIntento(email, false); return res.status(401).json({ success: false, error: 'Email o contraseña incorrectos' }); }
    registrarIntento(email, true);

    if (usuario.rol === 'dueño') {
      const barberias = await sb('barberias', { filters: `&dueno_id=eq.${usuario.id}` });
      if (barberias.length > 0) {
        const barberia = barberias[0];
        if (barberia.estado_verificacion === 'trial' && barberia.fecha_trial_inicio) {
          const diasTranscurridos = (Date.now() - new Date(barberia.fecha_trial_inicio).getTime()) / (1000*60*60*24);
          if (diasTranscurridos >= 14) {
            await sbUpdate('barberias', `id=eq.${barberia.id}`, { estado_verificacion: 'suspendido' });
            barberia.estado_verificacion = 'suspendido';
          }
        }
        usuario.negocio_nombre = barberia.nombre; usuario.ciudad = barberia.ciudad; usuario.estado = barberia.estado;
        usuario.negocio_telefono = barberia.telefono; usuario.negocio_logo = barberia.logo; usuario.tipo_negocio = barberia.tipo_negocio;
        usuario.fecha_trial_inicio = barberia.fecha_trial_inicio; usuario.estado_verificacion = barberia.estado_verificacion; usuario.barberia_id = barberia.id;
      }
    }
    if (usuario.rol === 'barbero') {
      const barberos = await sb('barberos', { filters: `&usuario_id=eq.${usuario.id}` });
      if (barberos.length > 0) { usuario.barbero_id = barberos[0].id; usuario.barberia_id = barberos[0].barberia_id; usuario.foto = barberos[0].foto; usuario.especialidad = barberos[0].especialidad; }
    }
    res.json({ success: true, user: { ...usuario, password: undefined }, token: 'token_' + usuario.id });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/auth/recuperar-contrasena', async (req, res) => {
  try {
    const { email, nueva_contrasena } = req.body;
    if (!email || !nueva_contrasena) return res.status(400).json({ success: false, error: 'Email y nueva contraseña requeridos' });
    if (nueva_contrasena.length < 6) return res.status(400).json({ success: false, error: 'La contraseña debe tener al menos 6 caracteres' });
    const usuarios = await sb('usuarios', { filters: `&email=eq.${encodeURIComponent(email)}` });
    if (usuarios.length === 0) return res.status(404).json({ success: false, error: 'Email no registrado' });
    const passwordHash = await bcrypt.hash(nueva_contrasena, 10);
    await sbUpdate('usuarios', `id=eq.${usuarios[0].id}`, { password: passwordHash });
    res.json({ success: true, message: 'Contraseña actualizada' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ============================================================
// BARBERÍAS
// ============================================================
app.get('/api/barberias', async (req, res) => {
  try {
    const { lat, lon, ciudad, tipo, categoria } = req.query;
    let filters = `&estado_verificacion=in.(activo,trial)`;
    if (ciudad) filters += `&or=(ciudad.ilike.*${ciudad}*,municipio.ilike.*${ciudad}*)`;
    if (tipo) filters += `&tipo_negocio=eq.${tipo}`;
    let barberias = await sb('barberias', { filters });
    if (categoria && categoria !== 'todos') {
      const servicios = await sb('servicios', { filters: `&categoria=eq.${categoria}`, select: 'id' });
      const servicioIds = servicios.map(s => s.id);
      if (servicioIds.length > 0) {
        const citas = await sb('citas', { filters: `&servicio_id=in.(${servicioIds.join(',')})`, select: 'barberia_id' });
        const barberiaIds = [...new Set(citas.map(c => c.barberia_id))];
        if (barberiaIds.length > 0) barberias = barberias.filter(b => barberiaIds.includes(b.id));
      }
    }
    if (lat && lon) {
      barberias = barberias.map(b => ({ ...b, distancia: calcularDistancia(parseFloat(lat), parseFloat(lon), b.latitud, b.longitud) })).sort((a, b) => a.distancia - b.distancia);
    }
    res.json({ success: true, data: barberias });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put('/api/barberias/:id', async (req, res) => {
  try {
    const { nombre, descripcion, telefono, logo, tipo_negocio, fidelizacion_citas, fidelizacion_beneficio } = req.body;
    await sbUpdate('barberias', `id=eq.${req.params.id}`, { nombre, descripcion, telefono, logo, tipo_negocio, fidelizacion_citas, fidelizacion_beneficio });
    res.json({ success: true, message: 'Negocio actualizado' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ============================================================
// SERVICIOS
// ============================================================
app.get('/api/servicios', async (req, res) => {
  try {
    const servicios = await sb('servicios');
    res.json({ success: true, data: servicios });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ============================================================
// BARBEROS
// ============================================================
app.get('/api/barberos/:barberiaId', async (req, res) => {
  try {
    const barberos = await sb('barberos', { filters: `&barberia_id=eq.${req.params.barberiaId}&activo=eq.true` });
    res.json({ success: true, data: barberos });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/barberos', async (req, res) => {
  try {
    const { barberia_id, nombre, foto, especialidad, horario } = req.body;
    if (!barberia_id || !nombre) return res.status(400).json({ success: false, error: 'Barbería y nombre requeridos' });
    let codigo = generarCodigo();
    for (let i = 0; i < 5; i++) {
      const existente = await sb('barberos', { filters: `&codigo_invitacion=eq.${codigo}` });
      if (existente.length === 0) break;
      codigo = generarCodigo();
    }
    const barbero = await sbInsert('barberos', { barberia_id, nombre, foto: foto || null, especialidad: especialidad || 'Cortes generales', horario: horario || null, codigo_invitacion: codigo, activo: true });
    res.status(201).json({ success: true, data: barbero });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put('/api/barberos/:id', async (req, res) => {
  try {
    const { nombre, foto, especialidad, descripcion, horario, activo } = req.body;
    const updated = await sbUpdate('barberos', `id=eq.${req.params.id}`, { nombre, foto, especialidad, descripcion, horario, activo });
    res.json({ success: true, data: updated });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.delete('/api/barberos/:id', async (req, res) => {
  try {
    await sbUpdate('barberos', `id=eq.${req.params.id}`, { activo: false });
    res.json({ success: true, message: 'Barbero desactivado' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/barbero/perfil/:usuarioId', async (req, res) => {
  try {
    const barberos = await sb('barberos', { filters: `&usuario_id=eq.${req.params.usuarioId}` });
    if (barberos.length === 0) return res.status(404).json({ success: false, error: 'Perfil no encontrado' });
    res.json({ success: true, data: barberos[0] });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put('/api/barbero/perfil/:barberoId', async (req, res) => {
  try {
    const { descripcion, especialidad, whatsapp, horario, apikey_whatsapp } = req.body;
    await sbUpdate('barberos', `id=eq.${req.params.barberoId}`, { descripcion, especialidad, whatsapp, horario, apikey_whatsapp });
    res.json({ success: true, message: 'Perfil actualizado' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
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
    const horasOcupadas = citasOcupadas.map(c => c.hora);
    res.json({ success: true, data: slots.filter(s => !horasOcupadas.includes(s)) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ============================================================
// CITAS
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

    if (barbero_id) {
      try {
        const barberos = await sb('barberos', { filters: `&id=eq.${barbero_id}` });
        if (barberos.length > 0 && barberos[0].whatsapp) {
          const msg = `✂️ CutConnect: Nueva cita agendada!\n📅 Fecha: ${fecha}\n⏰ Hora: ${hora}`;
          await enviarWhatsApp(barberos[0].whatsapp, msg);
        }
      } catch (e) { console.log('Error notificando barbero:', e.message); }
    }

    if (usuario_id) {
      try {
        const usuarios = await sb('usuarios', { filters: `&id=eq.${usuario_id}`, select: 'nombre,telefono' });
        if (usuarios.length > 0 && usuarios[0].telefono) {
          const barberias = await sb('barberias', { filters: `&id=eq.${barberia_id}`, select: 'nombre' });
          const nombreBarberia = barberias.length > 0 ? barberias[0].nombre : 'la barbería';
          const msg = `✅ CutConnect: Tu cita está confirmada!\n💈 ${nombreBarberia}\n📅 Fecha: ${fecha}\n⏰ Hora: ${hora}\n¡Te esperamos!`;
          await enviarWhatsApp(usuarios[0].telefono, msg);
        }
      } catch (e) { console.log('Error notificando cliente:', e.message); }
    }

    res.status(201).json({ success: true, message: 'Cita agendada', cita });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/citas/completar/:id', async (req, res) => {
  try {
    await sbUpdate('citas', `id=eq.${req.params.id}`, { estado: 'completada' });
    res.json({ success: true, message: 'Cita completada' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/citas/cancelar/:id', async (req, res) => {
  try {
    await sbUpdate('citas', `id=eq.${req.params.id}`, { estado: 'cancelada' });
    res.json({ success: true, message: 'Cita cancelada' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/citas/usuario/:usuarioId', async (req, res) => {
  try {
    const citas = await sb('citas', { filters: `&usuario_id=eq.${req.params.usuarioId}&estado=eq.agendada`, select: '*,barberia:barberias(*),barbero:barberos(*),servicio:servicios(*)' });
    res.json({ success: true, data: citas });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/citas/barberia/:barberiaId', async (req, res) => {
  try {
    const citas = await sb('citas', { filters: `&barberia_id=eq.${req.params.barberiaId}&estado=eq.agendada`, select: '*,barbero:barberos(*),servicio:servicios(*),cliente:usuarios(nombre,email,telefono)' });
    res.json({ success: true, data: citas });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/citas/barbero/:barberoId', async (req, res) => {
  try {
    const citas = await sb('citas', { filters: `&barbero_id=eq.${req.params.barberoId}&estado=eq.agendada`, select: '*,servicio:servicios(*),cliente:usuarios(nombre,email,telefono)' });
    res.json({ success: true, data: citas });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ============================================================
// STATS
// ============================================================
app.get('/api/stats/barberos/:barberiaId', async (req, res) => {
  try {
    const citas = await sb('citas', { filters: `&barberia_id=eq.${req.params.barberiaId}`, select: 'barbero_id,barbero:barberos(nombre,foto)' });
    const ranking = {};
    citas.forEach(c => {
      if (c.barbero_id) {
        if (!ranking[c.barbero_id]) ranking[c.barbero_id] = { barbero_id: c.barbero_id, nombre: c.barbero?.nombre || 'Sin nombre', foto: c.barbero?.foto || null, total_citas: 0 };
        ranking[c.barbero_id].total_citas++;
      }
    });
    res.json({ success: true, data: Object.values(ranking).sort((a, b) => b.total_citas - a.total_citas) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
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
    const result = negocios.map(n => ({ ...n, email_dueno: n.dueno?.email, diasTrial: n.estado_verificacion === 'trial' && n.fecha_trial_inicio ? Math.ceil(14 - (Date.now() - new Date(n.fecha_trial_inicio).getTime()) / (1000*60*60*24)) : null }));
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});
app.get('/api/admin/usuarios', adminAuth, async (req, res) => {
  try {
    const todos = await sb('usuarios', { select: 'id,nombre,email,telefono,pais,rol,created_at' });
    const clientes = todos.filter(u => u.rol === 'cliente');
    res.json({ success: true, data: clientes });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
app.post('/api/admin/aprobar/:id', adminAuth, async (req, res) => {
  try {
    await sbUpdate('barberias', `id=eq.${req.params.id}`, { estado_verificacion: 'trial', fecha_trial_inicio: new Date().toISOString() });
    await sbUpdate('usuarios', `id=eq.${req.params.id}`, { estado_verificacion: 'trial', fecha_trial_inicio: new Date().toISOString() });
    res.json({ success: true, message: 'Negocio aprobado. Trial de 14 días iniciado.' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/admin/rechazar/:id', adminAuth, async (req, res) => {
  try {
    await sbUpdate('barberias', `id=eq.${req.params.id}`, { estado_verificacion: 'rechazado' });
    await sbUpdate('usuarios', `id=eq.${req.params.id}`, { estado_verificacion: 'rechazado' });
    res.json({ success: true, message: 'Negocio rechazado.' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/admin/activar/:id', adminAuth, async (req, res) => {
  try {
    await sbUpdate('barberias', `id=eq.${req.params.id}`, { estado_verificacion: 'activo' });
    await sbUpdate('usuarios', `id=eq.${req.params.id}`, { estado_verificacion: 'activo' });
    res.json({ success: true, message: 'Negocio activado.' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/admin/suspender/:id', adminAuth, async (req, res) => {
  try {
    await sbUpdate('barberias', `id=eq.${req.params.id}`, { estado_verificacion: 'suspendido' });
    await sbUpdate('usuarios', `id=eq.${req.params.id}`, { estado_verificacion: 'suspendido' });
    res.json({ success: true, message: 'Negocio suspendido.' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/admin/stats', adminAuth, async (req, res) => {
  try {
    const barberias = await sb('barberias', { select: 'estado_verificacion,tipo_negocio' });
    const clientes = await sb('usuarios', { filters: `&rol=eq.cliente`, select: 'id' });
    const citas = await sb('citas', { select: 'id' });
    res.json({ success: true, data: { total: barberias.length, pendientes: barberias.filter(b => b.estado_verificacion === 'pendiente').length, trial: barberias.filter(b => b.estado_verificacion === 'trial').length, activos: barberias.filter(b => b.estado_verificacion === 'activo').length, suspendidos: barberias.filter(b => b.estado_verificacion === 'suspendido').length, rechazados: barberias.filter(b => b.estado_verificacion === 'rechazado').length, barberias: barberias.filter(b => b.tipo_negocio === 'barberia').length, peluquerias: barberias.filter(b => b.tipo_negocio === 'peluqueria').length, total_citas: citas.length, total_clientes: clientes.length } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ============================================================
// FIDELIZACIÓN
// ============================================================
app.get('/api/fidelizacion/:barberiaId/:usuarioId', async (req, res) => {
  try {
    const { barberiaId, usuarioId } = req.params;
    const [barberia, citas] = await Promise.all([
      sb('barberias', { filters: `&id=eq.${barberiaId}`, select: 'fidelizacion_citas,fidelizacion_beneficio' }),
      sb('citas', { filters: `&barberia_id=eq.${barberiaId}&usuario_id=eq.${usuarioId}&estado=neq.cancelada`, select: 'id' })
    ]);
    if (barberia.length === 0) return res.status(404).json({ success: false });
    res.json({ success: true, data: { citas_actuales: citas.length, citas_requeridas: barberia[0].fidelizacion_citas || 10, beneficio: barberia[0].fidelizacion_beneficio || 'Premio especial' } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ============================================================
// ANUNCIOS
// ============================================================
app.get('/api/anuncios', async (req, res) => {
  try {
    const anuncios = await sb('anuncios', { filters: '&activo=eq.true&order=id.desc' });
    res.json({ success: true, data: anuncios });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/anuncios/activo', async (req, res) => {
  try {
    const anuncios = await sb('anuncios', { filters: '&activo=eq.true&order=id.desc&limit=1' });
    res.json({ success: true, data: anuncios[0] || null });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/anuncios/solicitud', async (req, res) => {
  try {
    const { titulo, subtitulo, imagen_url, boton_texto, boton_url, ciudad, pais, latitud, longitud, anunciante_nombre, anunciante_email, anunciante_telefono } = req.body;
    if (!titulo || !anunciante_nombre || !anunciante_email || !ciudad) return res.status(400).json({ success: false, error: 'Faltan datos requeridos' });
    const anuncio = await sbInsert('anuncios', { titulo, subtitulo: subtitulo || '', imagen_url: imagen_url || '', boton_texto: boton_texto || 'Ver más', boton_url: boton_url || '', ciudad, pais: pais || '', latitud: latitud ? parseFloat(latitud) : null, longitud: longitud ? parseFloat(longitud) : null, anunciante_nombre, anunciante_email, anunciante_telefono: anunciante_telefono || '', activo: false, estado: 'pendiente' });
    res.status(201).json({ success: true, data: anuncio });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/admin/anuncios', adminAuth, async (req, res) => {
  try {
    const anuncios = await sb('anuncios', { filters: '&order=id.desc' });
    res.json({ success: true, data: anuncios });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/admin/solicitudes-publicidad', adminAuth, async (req, res) => {
  try {
    const solicitudes = await sb('anuncios', { filters: '&order=id.desc' });
    res.json({ success: true, data: solicitudes });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/admin/anuncios', adminAuth, async (req, res) => {
  try {
    const { titulo, subtitulo, imagen_url, boton_texto, boton_url, ciudad, pais } = req.body;
    const anuncio = await sbInsert('anuncios', { titulo, subtitulo, imagen_url, boton_texto, boton_url, ciudad: ciudad || null, pais: pais || null, activo: true, estado: 'activo' });
    res.json({ success: true, data: anuncio });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put('/api/admin/anuncios/:id', adminAuth, async (req, res) => {
  try {
    const { titulo, subtitulo, imagen_url, boton_texto, boton_url, activo, ciudad, pais, estado, fecha_vencimiento, anunciante_nombre, anunciante_email, anunciante_telefono } = req.body;
    await sbUpdate('anuncios', `id=eq.${req.params.id}`, { titulo, subtitulo, imagen_url, boton_texto, boton_url, activo, ciudad, pais, estado, fecha_vencimiento, anunciante_nombre, anunciante_email, anunciante_telefono });
    res.json({ success: true, message: 'Anuncio actualizado' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ============================================================
// PRECIOS POR BARBERÍA
// ============================================================
app.get('/api/precios/:barberiaId', async (req, res) => {
  try {
    const precios = await sb('precios_barberia', { filters: `&barberia_id=eq.${req.params.barberiaId}&activo=eq.true`, select: '*,servicio:servicios(nombre)' });
    res.json({ success: true, data: precios });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/precios/:barberiaId', async (req, res) => {
  try {
    const { servicio_id, precio } = req.body;
    const existing = await sb('precios_barberia', { filters: `&barberia_id=eq.${req.params.barberiaId}&servicio_id=eq.${servicio_id}` });
    if (existing.length > 0) await sbUpdate('precios_barberia', `id=eq.${existing[0].id}`, { precio, activo: true });
    else await sbInsert('precios_barberia', { barberia_id: req.params.barberiaId, servicio_id, precio });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ============================================================
// DASHBOARD PRO
// ============================================================
app.get('/api/stats/ingresos/:barberiaId', async (req, res) => {
  try {
    const hoy = new Date().toISOString().split('T')[0];
    const inicioSemana = new Date(); inicioSemana.setDate(inicioSemana.getDate() - inicioSemana.getDay()); inicioSemana.setHours(0,0,0,0);
    const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0,0,0,0);
    const [citas, precios, servicios, barberos] = await Promise.all([
      sb('citas', { filters: `&barberia_id=eq.${req.params.barberiaId}&estado=neq.cancelada`, select: 'servicio_id,fecha,hora,barbero_id,usuario_id' }),
      sb('precios_barberia', { filters: `&barberia_id=eq.${req.params.barberiaId}&activo=eq.true` }),
      sb('servicios', { select: 'id,nombre,precio' }),
      sb('barberos', { filters: `&barberia_id=eq.${req.params.barberiaId}&activo=eq.true`, select: 'id,nombre' })
    ]);
    const getPrecio = (servicioId) => {
      const custom = precios.find(p => p.servicio_id === servicioId);
      if (custom) return custom.precio;
      const base = servicios.find(s => s.id === servicioId);
      return base?.precio || 0;
    };
    const citasHoy = citas.filter(c => c.fecha === hoy);
    const citasSemana = citas.filter(c => new Date(c.fecha + 'T12:00:00') >= inicioSemana);
    const citasMes = citas.filter(c => new Date(c.fecha + 'T12:00:00') >= inicioMes);
    const ingresosHoy = citasHoy.reduce((a, c) => a + getPrecio(c.servicio_id), 0);
    const ingresosSemana = citasSemana.reduce((a, c) => a + getPrecio(c.servicio_id), 0);
    const ingresosMes = citasMes.reduce((a, c) => a + getPrecio(c.servicio_id), 0);
    const ingresosPromedio = citasMes.length > 0 ? ingresosMes / citasMes.length : 0;
    const diasTranscurridos = new Date().getDate();
    const diasDelMes = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    const proyeccionMes = diasTranscurridos > 0 ? (ingresosMes / diasTranscurridos) * diasDelMes : 0;
    const serviciosCount = {}; const serviciosIngresos = {};
    citas.forEach(c => {
      serviciosCount[c.servicio_id] = (serviciosCount[c.servicio_id] || 0) + 1;
      serviciosIngresos[c.servicio_id] = (serviciosIngresos[c.servicio_id] || 0) + getPrecio(c.servicio_id);
    });
    const servicioTopId = Object.keys(serviciosCount).sort((a, b) => serviciosCount[b] - serviciosCount[a])[0];
    const servicioMasVendido = servicios.find(s => s.id == servicioTopId);
    const servicioRentableId = Object.keys(serviciosIngresos).sort((a, b) => serviciosIngresos[b] - serviciosIngresos[a])[0];
    const servicioMasRentable = servicios.find(s => s.id == servicioRentableId);
    const clientesMes = citasMes.map(c => c.usuario_id).filter(Boolean);
    const clientesUnicos = [...new Set(clientesMes)];
    let clientesNuevos = 0; let clientesRecurrentes = 0;
    for (const usuarioId of clientesUnicos) {
      const todasCitas = citas.filter(c => c.usuario_id === usuarioId);
      if (todasCitas.length === 1) clientesNuevos++;
      else if (todasCitas.length >= 2) clientesRecurrentes++;
    }
    const horasCount = {};
    citas.forEach(c => { if(c.hora) { const h = c.hora.split(':')[0] + ':00'; horasCount[h] = (horasCount[h] || 0) + 1; } });
    const horaPico = Object.keys(horasCount).sort((a, b) => horasCount[b] - horasCount[a])[0];
    const hace7dias = new Date(); hace7dias.setDate(hace7dias.getDate() - 7);
    let barberosSinCitas = 0;
    barberos.forEach(b => {
      const citasBarbero = citas.filter(c => c.barbero_id === b.id && new Date(c.fecha + 'T12:00:00') >= hace7dias);
      if (citasBarbero.length === 0) barberosSinCitas++;
    });
    let diasSinCitas = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(inicioSemana); d.setDate(d.getDate() + i);
      const dStr = d.toISOString().split('T')[0];
      if (new Date(dStr) <= new Date(hoy)) {
        if (citas.filter(c => c.fecha === dStr).length === 0) diasSinCitas++;
      }
    }
    res.json({ success: true, data: { ingresos_hoy: ingresosHoy, ingresos_semana: ingresosSemana, ingresos_mes: ingresosMes, ingreso_promedio: ingresosPromedio, proyeccion_mes: proyeccionMes, citas_mes: citasMes.length, servicio_mas_vendido: servicioMasVendido?.nombre || '—', servicio_mas_vendido_count: servicioTopId ? serviciosCount[servicioTopId] : 0, servicio_mas_rentable: servicioMasRentable?.nombre || '—', ingreso_servicio_top: servicioRentableId ? serviciosIngresos[servicioRentableId] : 0, clientes_nuevos: clientesNuevos, clientes_recurrentes: clientesRecurrentes, hora_pico: horaPico || null, citas_hora_pico: horaPico ? horasCount[horaPico] : 0, alertas_barberos_sin_citas: barberosSinCitas, dias_sin_citas: diasSinCitas } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ============================================================
// STATS POR DÍA (para gráficas Pro)
// ============================================================
app.get('/api/stats/graficas/:barberiaId', async (req, res) => {
  try {
    const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0,0,0,0);
    const [citas, precios, servicios] = await Promise.all([
      sb('citas', { filters: `&barberia_id=eq.${req.params.barberiaId}&estado=neq.cancelada`, select: 'servicio_id,fecha,estado' }),
      sb('precios_barberia', { filters: `&barberia_id=eq.${req.params.barberiaId}&activo=eq.true` }),
      sb('servicios', { select: 'id,nombre,precio' })
    ]);
    const getPrecio = (servicioId) => {
      const custom = precios.find(p => p.servicio_id === servicioId);
      if (custom) return custom.precio;
      return servicios.find(s => s.id === servicioId)?.precio || 0;
    };
    const dias = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
    const ingresosPorDia = Array(7).fill(0);
    const citasPorDia = Array(7).fill(0);
    const citasMes = citas.filter(c => new Date(c.fecha + 'T12:00:00') >= inicioMes);
    citasMes.forEach(c => {
      const dia = new Date(c.fecha + 'T12:00:00').getDay();
      ingresosPorDia[dia] += getPrecio(c.servicio_id);
      citasPorDia[dia]++;
    });
    const semanas = [0,0,0,0];
    citasMes.forEach(c => {
      const fecha = new Date(c.fecha + 'T12:00:00');
      const semana = Math.min(Math.floor((fecha.getDate()-1)/7), 3);
      semanas[semana]++;
    });
    res.json({ success: true, data: { por_dia: dias.map((d,i) => ({ dia: d, ingresos: ingresosPorDia[i], citas: citasPorDia[i] })), por_semana: semanas.map((c,i) => ({ semana: `Sem ${i+1}`, citas: c })) } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ============================================================
// PAGOS - STRIPE
// ============================================================

  try {
    const { barberia_id, email } = req.body;
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price_data: { currency: 'usd', product_data: { name: 'CutConnect Pro', description: 'Dashboard avanzado y estadísticas por 30 días' }, unit_amount: 399 }, quantity: 1 }],
      mode: 'payment',
      success_url: `https://cutconnect-web.vercel.app?pago=exitoso&barberia_id=${barberia_id}`,
      cancel_url: `https://cutconnect-web.vercel.app?pago=cancelado`,
      customer_email: email
    });
    res.json({ success: true, url: session.url, session_id: session.id });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/pagos/stripe/verificar', async (req, res) => {
  try {
    const { session_id, barberia_id } = req.body;
    const session = await stripe.checkout.sessions.retrieve(session_id);
    if (session.payment_status === 'paid') {
      const fechaVencimiento = new Date(); fechaVencimiento.setDate(fechaVencimiento.getDate() + 30);
      await sbUpdate('barberias', `id=eq.${barberia_id}`, { estado_verificacion: 'activo', fecha_vencimiento: fechaVencimiento.toISOString() });
      await sbUpdate('usuarios', `id=eq.${barberia_id}`, { estado_verificacion: 'activo' });
      res.json({ success: true, message: 'Pago verificado. Cuenta activada.' });
    } else { res.json({ success: false, message: 'Pago pendiente o fallido' }); }
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/pagos/binance', (req, res) => {
  res.json({ success: true, data: { pay_id: '176779028', nombre: 'CutConnect', qr_url: 'https://mypcsegsvarcwyigzodc.supabase.co/storage/v1/object/public/imagenes-cutconnect/QR%20BINANCE.jpeg', monto: 3.99, moneda: 'USDT' } });
});

app.listen(3001, () => { console.log('CutConnect Backend corriendo en http://localhost:3001'); });
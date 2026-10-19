/** Datos fijos para elegir en vez de escribir: país, ciudad, prefijo telefónico y zona horaria. Compartido por web y móvil. */
export interface Country { code: string; name: string; dial: string; timeZones: readonly string[]; cities: readonly string[] }

export const COUNTRIES: readonly Country[] = [
  { code: 'EC', name: 'Ecuador', dial: '+593', timeZones: ["America/Guayaquil", "Pacific/Galapagos"], cities: ['Quito', 'Guayaquil', 'Cuenca', 'Ambato', 'Loja', 'Manta', 'Portoviejo', 'Machala', 'Esmeraldas', 'Riobamba', 'Ibarra', 'Santo Domingo', 'Latacunga', 'Babahoyo', 'Quevedo', 'Tulcán'] },
  { code: 'CO', name: 'Colombia', dial: '+57', timeZones: ["America/Bogota"], cities: ['Bogotá', 'Medellín', 'Cali', 'Barranquilla', 'Cartagena', 'Bucaramanga', 'Cúcuta', 'Pereira', 'Manizales', 'Santa Marta', 'Ibagué', 'Villavicencio', 'Pasto', 'Armenia', 'Neiva', 'Popayán'] },
  { code: 'PE', name: 'Perú', dial: '+51', timeZones: ["America/Lima"], cities: ['Lima', 'Arequipa', 'Trujillo', 'Chiclayo', 'Cusco', 'Piura', 'Iquitos', 'Huancayo', 'Tacna', 'Pucallpa', 'Cajamarca', 'Ica'] },
  { code: 'MX', name: 'México', dial: '+52', timeZones: ["America/Mexico_City", "America/Tijuana", "America/Cancun", "America/Monterrey"], cities: ['Ciudad de México', 'Guadalajara', 'Monterrey', 'Puebla', 'Tijuana', 'León', 'Mérida', 'Cancún', 'Querétaro', 'Toluca', 'Chihuahua', 'Aguascalientes', 'San Luis Potosí', 'Morelia', 'Veracruz', 'Oaxaca'] },
  { code: 'CL', name: 'Chile', dial: '+56', timeZones: ["America/Santiago"], cities: ['Santiago', 'Valparaíso', 'Concepción', 'Viña del Mar', 'Antofagasta', 'Temuco', 'La Serena', 'Rancagua', 'Talca', 'Puerto Montt', 'Iquique', 'Punta Arenas'] },
  { code: 'AR', name: 'Argentina', dial: '+54', timeZones: ["America/Argentina/Buenos_Aires"], cities: ['Buenos Aires', 'Córdoba', 'Rosario', 'Mendoza', 'La Plata', 'San Miguel de Tucumán', 'Mar del Plata', 'Salta', 'Santa Fe', 'San Juan', 'Neuquén', 'Bahía Blanca'] },
  { code: 'VE', name: 'Venezuela', dial: '+58', timeZones: ["America/Caracas"], cities: ['Caracas', 'Maracaibo', 'Valencia', 'Barquisimeto', 'Maracay', 'Ciudad Guayana', 'Barcelona', 'Maturín', 'Mérida'] },
  { code: 'BO', name: 'Bolivia', dial: '+591', timeZones: ["America/La_Paz"], cities: ['La Paz', 'Santa Cruz de la Sierra', 'Cochabamba', 'Sucre', 'Oruro', 'Potosí', 'Tarija', 'El Alto'] },
  { code: 'UY', name: 'Uruguay', dial: '+598', timeZones: ["America/Montevideo"], cities: ['Montevideo', 'Salto', 'Paysandú', 'Maldonado', 'Rivera', 'Colonia del Sacramento'] },
  { code: 'PY', name: 'Paraguay', dial: '+595', timeZones: ["America/Asuncion"], cities: ['Asunción', 'Ciudad del Este', 'San Lorenzo', 'Luque', 'Encarnación', 'Lambaré'] },
  { code: 'BR', name: 'Brasil', dial: '+55', timeZones: ["America/Sao_Paulo"], cities: ['São Paulo', 'Río de Janeiro', 'Brasilia', 'Salvador', 'Fortaleza', 'Belo Horizonte', 'Curitiba', 'Recife', 'Porto Alegre', 'Manaos'] },
  { code: 'PA', name: 'Panamá', dial: '+507', timeZones: ["America/Panama"], cities: ['Ciudad de Panamá', 'Colón', 'David', 'Santiago', 'Chitré'] },
  { code: 'CR', name: 'Costa Rica', dial: '+506', timeZones: ["America/Costa_Rica"], cities: ['San José', 'Alajuela', 'Cartago', 'Heredia', 'Liberia', 'Puntarenas'] },
  { code: 'GT', name: 'Guatemala', dial: '+502', timeZones: ["America/Guatemala"], cities: ['Ciudad de Guatemala', 'Quetzaltenango', 'Antigua Guatemala', 'Escuintla', 'Cobán'] },
  { code: 'SV', name: 'El Salvador', dial: '+503', timeZones: ["America/El_Salvador"], cities: ['San Salvador', 'Santa Ana', 'San Miguel', 'Soyapango'] },
  { code: 'HN', name: 'Honduras', dial: '+504', timeZones: ["America/Tegucigalpa"], cities: ['Tegucigalpa', 'San Pedro Sula', 'La Ceiba', 'Choloma'] },
  { code: 'NI', name: 'Nicaragua', dial: '+505', timeZones: ["America/Managua"], cities: ['Managua', 'León', 'Masaya', 'Granada'] },
  { code: 'DO', name: 'República Dominicana', dial: '+1', timeZones: ["America/Santo_Domingo"], cities: ['Santo Domingo', 'Santiago de los Caballeros', 'Punta Cana', 'La Romana', 'San Pedro de Macorís'] },
  { code: 'CU', name: 'Cuba', dial: '+53', timeZones: ["America/Havana"], cities: ['La Habana', 'Santiago de Cuba', 'Camagüey', 'Holguín', 'Santa Clara'] },
  { code: 'ES', name: 'España', dial: '+34', timeZones: ["Europe/Madrid", "Atlantic/Canary"], cities: ['Madrid', 'Barcelona', 'Valencia', 'Sevilla', 'Zaragoza', 'Málaga', 'Bilbao', 'Murcia', 'Palma', 'Las Palmas', 'Alicante', 'Valladolid'] },
  { code: 'US', name: 'Estados Unidos', dial: '+1', timeZones: ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles"], cities: ['Nueva York', 'Miami', 'Los Ángeles', 'Chicago', 'Houston', 'Dallas', 'Washington D. C.', 'Orlando', 'San Francisco', 'Atlanta', 'Boston', 'Seattle'] },
];

export const countryByCode = (code: string | null | undefined): Country | undefined => COUNTRIES.find((c) => c.code === code);
/** Acepta código ISO o nombre (datos antiguos guardaban el nombre escrito a mano). */
export const countryByAny = (v: string | null | undefined): Country | undefined => {
  if (!v) return undefined;
  const k = v.trim().toLowerCase();
  return COUNTRIES.find((c) => c.code.toLowerCase() === k || c.name.toLowerCase() === k);
};
export const citiesOf = (code: string | null | undefined): readonly string[] => countryByAny(code)?.cities ?? [];

const TZ_LABEL: Record<string, string> = {
  'America/Guayaquil': 'Ecuador continental (Guayaquil)', 'Pacific/Galapagos': 'Galápagos', 'America/Bogota': 'Colombia (Bogotá)', 'America/Lima': 'Perú (Lima)',
  'America/Mexico_City': 'México centro (CDMX)', 'America/Tijuana': 'México noroeste (Tijuana)', 'America/Cancun': 'México sureste (Cancún)', 'America/Monterrey': 'México noreste (Monterrey)',
  'America/Santiago': 'Chile (Santiago)', 'America/Argentina/Buenos_Aires': 'Argentina (Buenos Aires)', 'America/Caracas': 'Venezuela (Caracas)', 'America/La_Paz': 'Bolivia (La Paz)',
  'America/Montevideo': 'Uruguay (Montevideo)', 'America/Asuncion': 'Paraguay (Asunción)', 'America/Sao_Paulo': 'Brasil (São Paulo)', 'America/Panama': 'Panamá',
  'America/Costa_Rica': 'Costa Rica', 'America/Guatemala': 'Guatemala', 'America/El_Salvador': 'El Salvador', 'America/Tegucigalpa': 'Honduras', 'America/Managua': 'Nicaragua',
  'America/Santo_Domingo': 'República Dominicana', 'America/Havana': 'Cuba (La Habana)', 'Europe/Madrid': 'España peninsular (Madrid)', 'Atlantic/Canary': 'Canarias',
  'America/New_York': 'EE. UU. este (Nueva York)', 'America/Chicago': 'EE. UU. centro (Chicago)', 'America/Denver': 'EE. UU. montaña (Denver)', 'America/Los_Angeles': 'EE. UU. oeste (Los Ángeles)', UTC: 'UTC',
};
export const timeZoneLabel = (tz: string): string => TZ_LABEL[tz] ?? tz;
export const timeZonesOf = (code: string | null | undefined): ReadonlyArray<{ value: string; label: string }> => {
  const list = countryByAny(code)?.timeZones ?? Object.keys(TZ_LABEL);
  return list.map((value) => ({ value, label: timeZoneLabel(value) }));
};
export const ALL_TIME_ZONES = Object.keys(TZ_LABEL).map((value) => ({ value, label: timeZoneLabel(value) }));

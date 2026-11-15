// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the widget (src/widgets.js):
// connection status, errors, the "Test the connection" report. Four
// languages, the four of the Gladys interface; German says "du", Spanish
// "usted". test/i18n.test.js checks every table.
// -----------------------------------------------------------------------------

import { ADMIN_ERROR_KINDS, ERROR_KINDS } from './vaultwarden/client.js';

/** The text of `language`, English when missing. */
export const pick = (text, language) =>
  typeof text === 'string' ? text : (text?.[language] ?? text?.en ?? '');

/** Replace `{name}` placeholders in every language of a text. */
export function render(text, values) {
  return Object.fromEntries(
    Object.entries(text).map(([language, value]) => [
      language,
      value.replace(/\{(\w+)\}/g, (all, key) => (key in values ? String(values[key]) : all)),
    ]),
  );
}

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

export const CONNECTION_TEXT = {
  noUrl: {
    en: 'Enter the address of your Vaultwarden server in the configuration.',
    fr: "Saisissez l'adresse de votre serveur Vaultwarden dans la configuration.",
    de: 'Gib die Adresse deines Vaultwarden-Servers in der Konfiguration ein.',
    es: 'Introduzca la dirección de su servidor Vaultwarden en la configuración.',
  },
  invalidUrl: {
    en: 'Server address not understood, e.g. https://vault.example.com',
    fr: 'Adresse du serveur incomprise, ex. https://vault.example.com',
    de: 'Serveradresse nicht verstanden, z. B. https://vault.example.com',
    es: 'Dirección del servidor no válida, p. ej. https://vault.example.com',
  },
};

// One short explanation per error kind (src/vaultwarden/client.js).
export const ERROR_TEXT = {
  [ERROR_KINDS.UNREACHABLE]: {
    en: 'Vaultwarden does not answer: check the address and the port.',
    fr: "Vaultwarden ne répond pas : vérifiez l'adresse et le port.",
    de: 'Vaultwarden antwortet nicht: Prüfe Adresse und Port.',
    es: 'Vaultwarden no responde: compruebe la dirección y el puerto.',
  },
  [ERROR_KINDS.TLS]: {
    en: 'Certificate refused: turn on "Accept a self-signed certificate" if it is yours.',
    fr: "Certificat refusé : activez « Accepter un certificat auto-signé » s'il est le vôtre.",
    de: 'Zertifikat abgelehnt: Aktiviere „Selbstsigniertes Zertifikat akzeptieren“, wenn es deines ist.',
    es: 'Certificado rechazado: active «Aceptar un certificado autofirmado» si es el suyo.',
  },
  [ERROR_KINDS.NOT_VAULTWARDEN]: {
    en: 'No Vaultwarden server at this address.',
    fr: 'Pas de serveur Vaultwarden à cette adresse.',
    de: 'Kein Vaultwarden-Server unter dieser Adresse.',
    es: 'No hay ningún servidor Vaultwarden en esta dirección.',
  },
  [ERROR_KINDS.HTTP]: {
    en: 'Unexpected answer from Vaultwarden.',
    fr: 'Réponse inattendue de Vaultwarden.',
    de: 'Unerwartete Antwort von Vaultwarden.',
    es: 'Respuesta inesperada de Vaultwarden.',
  },
  [ADMIN_ERROR_KINDS.AUTH]: {
    en: 'Admin token refused: check it, or leave the field empty.',
    fr: "Jeton d'administration refusé : vérifiez-le, ou laissez le champ vide.",
    de: 'Admin-Token abgelehnt: Prüfe ihn oder lass das Feld leer.',
    es: 'Token de administración rechazado: compruébelo o deje el campo vacío.',
  },
  [ADMIN_ERROR_KINDS.DISABLED]: {
    en: 'The admin page of Vaultwarden is disabled (no ADMIN_TOKEN): leave the token empty.',
    fr: "La page d'administration de Vaultwarden est désactivée (pas d'ADMIN_TOKEN) : laissez le jeton vide.",
    de: 'Die Admin-Seite von Vaultwarden ist deaktiviert (kein ADMIN_TOKEN): Lass den Token leer.',
    es: 'La página de administración de Vaultwarden está desactivada (sin ADMIN_TOKEN): deje el token vacío.',
  },
  [ADMIN_ERROR_KINDS.RATE_LIMITED]: {
    en: 'Too many admin logins: Vaultwarden asks to wait a few minutes.',
    fr: "Trop de connexions d'administration : Vaultwarden demande d'attendre quelques minutes.",
    de: 'Zu viele Admin-Anmeldungen: Vaultwarden verlangt, ein paar Minuten zu warten.',
    es: 'Demasiados inicios de sesión de administración: Vaultwarden pide esperar unos minutos.',
  },
  [ADMIN_ERROR_KINDS.FAILED]: {
    en: 'The admin statistics could not be read.',
    fr: "Les statistiques d'administration n'ont pas pu être lues.",
    de: 'Die Admin-Statistiken konnten nicht gelesen werden.',
    es: 'No se han podido leer las estadísticas de administración.',
  },
};

// "Test the connection": the sentences are joined with a space.
export const REPORT_TEXT = {
  en: {
    server: 'Vaultwarden {version} reachable, answered in {ms} ms.',
    upToDate: 'Up to date.',
    update: 'Version {latest} available.',
    accounts:
      '{users} user(s), {organizations} organization(s), {invitations} pending invitation(s), {disabled} disabled account(s).',
    noAdmin: 'No admin token: no account statistics.',
    waiting: 'Waiting for the first reading…',
  },
  fr: {
    server: 'Vaultwarden {version} joignable, réponse en {ms} ms.',
    upToDate: 'À jour.',
    update: 'Version {latest} disponible.',
    accounts:
      '{users} utilisateur(s), {organizations} organisation(s), {invitations} invitation(s) en attente, {disabled} compte(s) désactivé(s).',
    noAdmin: "Pas de jeton d'administration : pas de statistiques des comptes.",
    waiting: 'En attente de la première lecture…',
  },
  de: {
    server: 'Vaultwarden {version} erreichbar, Antwort in {ms} ms.',
    upToDate: 'Aktuell.',
    update: 'Version {latest} verfügbar.',
    accounts:
      '{users} Benutzer, {organizations} Organisation(en), {invitations} offene Einladung(en), {disabled} deaktiviert.',
    noAdmin: 'Kein Admin-Token: keine Kontenstatistik.',
    waiting: 'Warte auf die erste Abfrage…',
  },
  es: {
    server: 'Vaultwarden {version} accesible, respuesta en {ms} ms.',
    upToDate: 'Actualizado.',
    update: 'Versión {latest} disponible.',
    accounts:
      '{users} usuario(s), {organizations} organización(es), {invitations} invitación(es) pendiente(s), {disabled} cuenta(s) desactivada(s).',
    noAdmin: 'Sin token de administración: sin estadísticas de cuentas.',
    waiting: 'Esperando la primera lectura…',
  },
};

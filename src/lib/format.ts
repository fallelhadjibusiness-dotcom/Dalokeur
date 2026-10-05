export const fcfa = (n: number) => `${n.toLocaleString("fr-FR").replace(/[  ]/g, " ")} FCFA`;
export const dateFr = (d: Date) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Dakar" }).format(d);

// Les fichiers ne sont jamais publics : toujours servis par /api/files après contrôle d'accès.
export const fileUrl = (key: string) => `/api/files/${key}`;

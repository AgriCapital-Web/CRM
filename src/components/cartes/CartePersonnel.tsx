import { forwardRef, type ReactNode } from "react";
import { QRCodeSVG } from "qrcode.react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import logo from "@/assets/logo-agricapital-v2.png";
import symbole from "@/assets/symbole-agricapital.png";
import signature from "@/assets/signature-direction.png";
import cachet from "@/assets/cachet-agricapital.png";
import { useSignedUrl } from "@/hooks/useSignedUrl";
import { CARTE_BUCKET } from "@/lib/photoCarte";
import { roleLabel, OFFICIAL_ROLES, normalizeRoles } from "@/lib/roles";

/**
 * Nouvelle carte professionnelle AgriCapital.
 *
 * Direction artistique :
 * - format portrait au ratio d'une carte bancaire : 54 × 85,6 mm ;
 * - grille fixe 540 × 856 px pour éviter les décalages html2canvas ;
 * - recto volontairement épuré, sans QR code ;
 * - verso dédié à la vérification avec un QR nettement plus grand ;
 * - palette strictement issue de la charte AgriCapital : vert, orange, blanc et gris ;
 * - aucune information ne dépend d'un positionnement absolu pour son contenu.
 */
const W = 540;
const H = 856;

const VERT = "#0B4A2E";
const VERT_CLAIR = "#137A45";
const ORANGE = "#E97A11";
const GRIS = "#3B3B3B";
const GRIS_MOYEN = "#737373";
const GRIS_CLAIR = "#E8E8E8";
const BLANC = "#FFFFFF";

export interface CarteData {
  id?: string;
  matricule: string;
  code_verification: string;
  nom_complet: string;
  poste?: string | null;
  departement?: string | null;
  role_code?: string | null;
  role_codes?: string[];
  type_contrat?: string | null;
  statut_agent?: string | null;
  mission?: string | null;
  zone_intervention?: string | null;
  photo_url?: string | null;
  photo_bucket?: string | null;
  date_delivrance?: string | null;
  date_expiration?: string | null;
  statut?: string | null;
  telephone?: string | null;
  email?: string | null;
}

export const highestRoleCode = (roles: string[] = [], roleLevels: Record<string, number> = Object.fromEntries(OFFICIAL_ROLES.map(r => [r.code, r.niveau]))) => normalizeRoles(roles).sort((a,b) => (roleLevels[a] ?? 999) - (roleLevels[b] ?? 999) || a.localeCompare(b))[0] || null;

export const CONTRATS = [
  { v: "cdi", l: "CDI" },
  { v: "cdd", l: "CDD" },
  { v: "prestataire", l: "Prestataire" },
  { v: "stage", l: "Stage" },
];

export const STATUTS_AGENT = [
  { v: "employe", l: "EMPLOYÉ" },
  { v: "cadre", l: "CADRE" },
  { v: "prestataire", l: "PRESTATAIRE" },
  { v: "stagiaire", l: "STAGIAIRE" },
  { v: "partenaire", l: "PARTENAIRE" },
];

export const contratLabel = (v?: string | null) => CONTRATS.find((c) => c.v === v)?.l || "—";
export const statutAgentLabel = (v?: string | null) =>
  STATUTS_AGENT.find((s) => s.v === v)?.l || "—";

const MISSIONS_PAR_ROLE: Record<string, string> = {
  admin: "Administration plateforme",
  responsable_operations: "Pilotage des opérations",
  directeur_tc: "Direction technico-commerciale",
  responsable_commercial: "Pilotage de portefeuille",
  responsable_zone: "Supervision de zone",
  comptable: "Gestion financière",
  chef_equipe_commercial: "Encadrement commercial",
  chef_equipe_technique: "Encadrement technique",
  chef_equipe_service_client: "Encadrement service client",
  commercial: "Acquisition clients",
  technicien: "Suivi des plantations",
  service_client: "Assistance clients",
  assistant_administratif: "Appui administratif",
};

export const missionAuto = (carte: CarteData) =>
  carte.mission ||
  MISSIONS_PAR_ROLE[carte.role_code || ""] ||
  carte.poste ||
  "—";

const fdate = (d?: string | null) => (d ? format(new Date(d), "dd/MM/yyyy", { locale: fr }) : "—");

export const validiteTexte = (carte: CarteData) => {
  if (carte.type_contrat === "cdi") return "Indéterminée";
  const debut = carte.date_delivrance ? `Du ${fdate(carte.date_delivrance)} ` : "";
  return carte.date_expiration ? `${debut}au ${fdate(carte.date_expiration)}` : "Indéterminée";
};

export const verificationUrl = (code: string) =>
  `https://app.agricapital.ci/verify/${code}`;

const initials = (nom: string) =>
  nom
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join("");

const Decor = () => (
  <>
    <div
      aria-hidden
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: 10,
        backgroundColor: VERT,
      }}
    />
    <div
      aria-hidden
      style={{
        position: "absolute",
        top: 10,
        left: 0,
        width: 92,
        height: 4,
        backgroundColor: ORANGE,
      }}
    />
    <div
      aria-hidden
      style={{
        position: "absolute",
        right: 0,
        bottom: 0,
        width: 150,
        height: 6,
        backgroundColor: ORANGE,
      }}
    />
    <div
      aria-hidden
      style={{
        position: "absolute",
        right: 0,
        bottom: 6,
        width: 92,
        height: 5,
        backgroundColor: VERT,
      }}
    />
  </>
);

const CardShell = ({ children }: { children: ReactNode }) => (
  <div
    style={{
      position: "relative",
      width: W,
      height: H,
      flexShrink: 0,
      overflow: "hidden",
      borderRadius: 24,
      backgroundColor: BLANC,
      border: "1px solid #D8D8D8",
      color: GRIS,
      fontFamily: "Arial, Helvetica, sans-serif",
      boxSizing: "border-box",
    }}
  >
    {children}
  </div>
);

const PhotoPlaceholder = ({ nom }: { nom: string }) => (
  <div
    aria-label="Emplacement photo"
    style={{
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#F3F4F2",
      color: VERT,
      gap: 12,
    }}
  >
    <div
      style={{
        width: 76,
        height: 76,
        borderRadius: "50%",
        backgroundColor: "#DCE6DF",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 25,
        fontWeight: 800,
      }}
    >
      {initials(nom) || "AC"}
    </div>
    <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>
      Photo
    </span>
  </div>
);

const InfoRow = ({
  label,
  value,
}: {
  label: string;
  value: string;
}) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "138px minmax(0,1fr)",
      alignItems: "center",
      minHeight: 42,
      borderBottom: `1px solid ${GRIS_CLAIR}`,
    }}
  >
    <span
      style={{
        color: VERT,
        fontSize: 10,
        fontWeight: 800,
        textTransform: "uppercase",
        letterSpacing: 0.45,
      }}
    >
      {label}
    </span>
    <span
      style={{
        color: GRIS,
        fontSize: 11.5,
        fontWeight: 600,
        lineHeight: "15px",
        overflowWrap: "anywhere",
        wordBreak: "break-word",
      }}
    >
      {value}
    </span>
  </div>
);

const QR = ({ code, size }: { code: string; size: number }) => (
  <div
    style={{
      width: size + 18,
      height: size + 18,
      padding: 9,
      backgroundColor: BLANC,
      border: `1px solid ${GRIS_CLAIR}`,
      borderRadius: 12,
      boxSizing: "border-box",
      flexShrink: 0,
    }}
  >
    <QRCodeSVG
      value={verificationUrl(code)}
      size={1024}
      level="H"
      includeMargin={true}
      style={{ width: "100%", height: "100%", display: "block", imageRendering: "pixelated" }}
    />
  </div>
);

const ContactIcon = ({ path }: { path: string }) => (
  <span
    style={{
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: VERT,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    }}
  >
    <svg viewBox="0 0 24 24" width={11} height={11} fill={BLANC} aria-hidden>
      <path d={path} />
    </svg>
  </span>
);

const CONTACTS = (carte: CarteData) => [
  {
    d: "M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2 4.6 1v3.4A2 2 0 0 1 18 21.6 18 18 0 0 1 2.4 6 2 2 0 0 1 4.4 4h3.4l1 4.6-2.2 2.2Z",
    t: carte.telephone || "",
  },
  {
    d: "M2 5h20v14H2V5Zm10 8L3.5 6.6 12 12l8.5-5.4L12 13Z",
    t: carte.email || "",
  },
  {
    d: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 2c1.6 2 2.4 4 2.4 6s-.8 4-2.4 6c-1.6-2-2.4-4-2.4-6s.8-4 2.4-6ZM4.3 9h3.3a16 16 0 0 0 0 6H4.3a8 8 0 0 1 0-6Zm12.1 0h3.3a8 8 0 0 1 0 6h-3.3a16 16 0 0 0 0-6Z",
    t: "www.agricapital.ci",
  },
].filter((contact) => Boolean(contact.t));

export const CarteRecto = forwardRef<HTMLDivElement, { carte: CarteData }>(({ carte }, ref) => {
  const photo = useSignedUrl(carte.photo_bucket || CARTE_BUCKET, carte.photo_url);
  const fonction = carte.poste || roleLabel(carte.role_code) || "—";
  const nom = carte.nom_complet || "Nom du titulaire";

  return (
    <div ref={ref}>
      <CardShell>
        <Decor />
        <div
          style={{
            position: "relative",
            zIndex: 1,
            height: "100%",
            boxSizing: "border-box",
            padding: "30px 30px 26px",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 74 }}>
            <img
              src={logo}
              alt="AgriCapital — Investir la terre. Cultiver l'avenir."
              style={{ display: "block", width: 230, height: 72, objectFit: "contain" }}
            />
          </div>

          <div style={{ marginTop: 22, textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 9 }}>
            <span style={{ width: 46, height: 1, backgroundColor: GRIS_CLAIR }} />
            <img src={symbole} alt="" style={{ width: 22, height: 22, objectFit: "contain", display: "block" }} />
            <span
              style={{
                color: VERT,
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: 1.8,
                textTransform: "uppercase",
              }}
            >
              Carte professionnelle
            </span>
            <span style={{ width: 46, height: 1, backgroundColor: GRIS_CLAIR }} />
          </div>

          <div
            style={{
              width: 188,
              height: 238,
              margin: "18px auto 0",
              borderRadius: 16,
              overflow: "hidden",
              border: `3px solid ${VERT}`,
              backgroundColor: "#F3F4F2",
              boxSizing: "border-box",
              flexShrink: 0,
            }}
          >
            {photo ? (
              <img
                src={photo}
                alt={nom}
                style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
              />
            ) : (
              <PhotoPlaceholder nom={nom} />
            )}
          </div>

          <div style={{ textAlign: "center", marginTop: 10, minHeight: 68 }}>
            <p
              style={{
                margin: 0,
                color: VERT,
                fontSize: nom.length > 40 ? 16 : nom.length > 32 ? 18 : nom.length > 24 ? 21 : 25,
                fontWeight: 800,
                lineHeight: "23px",
                textTransform: "uppercase",
                overflowWrap: "anywhere",
                wordBreak: "break-word",
              }}
            >
              {nom}
            </p>
            <p
              style={{
                margin: "7px 0 0",
                color: GRIS_MOYEN,
                fontSize: 13,
                fontWeight: 700,
                lineHeight: "17px",
                textTransform: "uppercase",
                minHeight: 17,
                whiteSpace: "normal",
                overflowWrap: "anywhere",
                wordBreak: "break-word",
              }}
            >
              {fonction}
            </p>
          </div>

          <div style={{ display: "flex", justifyContent: "center", marginTop: 11, minHeight: 30 }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 112,
                height: 30,
                padding: "0 15px",
                boxSizing: "border-box",
                borderRadius: 15,
                backgroundColor: VERT,
                color: BLANC,
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: 0.7,
                textTransform: "uppercase",
              }}
            >
              {statutAgentLabel(carte.statut_agent)}
            </span>
          </div>

          <div style={{ marginTop: 14 }}>
            <InfoRow label="Identifiant" value={carte.matricule} />
            <InfoRow
              label="Zone d'intervention"
              value={carte.zone_intervention || carte.departement || "Côte d'Ivoire"}
            />
            <InfoRow label="Validité" value={validiteTexte(carte)} />
          </div>

          <div
            style={{
              marginTop: "auto",
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "space-between",
              gap: 18,
              minHeight: 64,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <p
                style={{
                  margin: 0,
                  color: VERT,
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: 0.8,
                  textTransform: "uppercase",
                }}
              >
                AgriCapital SARL
              </p>
              <p style={{ margin: "5px 0 0", color: GRIS_MOYEN, fontSize: 8.5, lineHeight: "12px" }}>
                Carte personnelle — non transférable
              </p>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "flex-end",
                gap: 5,
                width: 120,
                height: 60,
                flexShrink: 0,
              }}
            >
              <div style={{ width: 72, height: 58, display: "flex", alignItems: "flex-end", justifyContent: "center", flexShrink: 0 }}>
                <img
                  src={signature}
                  alt="Signature de la direction"
                  style={{ width: 70, height: 38, objectFit: "contain", display: "block" }}
                />
              </div>
              <img
                src={cachet}
                alt="Cachet AgriCapital"
                style={{ width: 46, height: 46, objectFit: "contain", display: "block", flexShrink: 0 }}
              />
            </div>
          </div>
        </div>
      </CardShell>
    </div>
  );
});
CarteRecto.displayName = "CarteRecto";

export const CarteVerso = forwardRef<HTMLDivElement, { carte: CarteData }>(({ carte }, ref) => {
  return (
    <div ref={ref}>
      <CardShell>
        <Decor />
        <div
          style={{
            position: "relative",
            zIndex: 1,
            height: "100%",
            boxSizing: "border-box",
            padding: "28px 34px 24px",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ display: "flex", justifyContent: "center", minHeight: 68 }}>
            <img
              src={logo}
              alt="AgriCapital — Investir la terre. Cultiver l'avenir."
              style={{ display: "block", width: 210, height: 60, objectFit: "contain" }}
            />
          </div>

          <div style={{ textAlign: "center", marginTop: 12 }}>
            <p
              style={{
                margin: 0,
                color: VERT,
                fontSize: 15,
                fontWeight: 800,
                letterSpacing: 1.3,
                textTransform: "uppercase",
              }}
            >
              Vérification d'authenticité
            </p>
            <span
              style={{
                display: "block",
                width: 54,
                height: 3,
                margin: "10px auto 0",
                backgroundColor: ORANGE,
              }}
            />
          </div>

          <div
            style={{
              marginTop: 22,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <QR code={carte.code_verification} size={235} />
          </div>

          <div style={{ textAlign: "center", marginTop: 15 }}>
            <p
              style={{
                margin: 0,
                color: GRIS,
                fontSize: 11.5,
                fontWeight: 600,
                lineHeight: "16px",
              }}
            >
              Scannez ce code avec votre téléphone pour vérifier l'authenticité et la validité de cette carte.
            </p>
            <div
              style={{
                marginTop: 12,
                padding: "11px 14px",
                borderRadius: 9,
                backgroundColor: "#F4F6F3",
                border: `1px solid ${GRIS_CLAIR}`,
              }}
            >
              <p
                style={{
                  margin: 0,
                  color: VERT,
                  fontSize: 12.5,
                  fontWeight: 800,
                  letterSpacing: 0.2,
                  lineHeight: "17px",
                }}
              >
                app.agricapital.ci/verify
              </p>
              <p style={{ margin: "4px 0 0", color: GRIS_MOYEN, fontSize: 9, lineHeight: "12px" }}>
                Adresse officielle de vérification
              </p>
            </div>
          </div>

          <div
            style={{
              marginTop: 18,
              padding: "13px 15px",
              borderLeft: `4px solid ${ORANGE}`,
              backgroundColor: "#FAFAFA",
              borderTop: `1px solid ${GRIS_CLAIR}`,
              borderRight: `1px solid ${GRIS_CLAIR}`,
              borderBottom: `1px solid ${GRIS_CLAIR}`,
              borderRadius: "0 8px 8px 0",
            }}
          >
            <p style={{ margin: 0, color: VERT, fontSize: 11.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Contrôle de la carte
            </p>
            <p style={{ margin: "5px 0 0", color: GRIS, fontSize: 11, lineHeight: "15px" }}>
              La page officielle affiche l'identité du titulaire, son statut et les informations de validité enregistrées par AgriCapital.
            </p>
          </div>

          <div style={{ marginTop: "auto" }}>
            <div
              style={{
                height: 1,
                width: "100%",
                backgroundColor: GRIS_CLAIR,
                marginBottom: 14,
              }}
            />

            <div style={{ display: "flex", gap: 18 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  style={{
                    margin: 0,
                    color: VERT,
                    fontSize: 12,
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: 0.4,
                  }}
                >
                  AgriCapital SARL
                </p>
                <p style={{ margin: "6px 0 0", color: GRIS_MOYEN, fontSize: 8.5, lineHeight: "12px" }}>
                  Société à Responsabilité Limitée
                  <br />
                  RCCM : CI-DAL-01-2025-B12-13435
                  <br />
                  Daloa-Gonaté, Côte d'Ivoire
                </p>
              </div>

              <div style={{ width: 195, flexShrink: 0 }}>
                {CONTACTS(carte).map((contact) => (
                  <div
                    key={contact.t}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      minHeight: 25,
                    }}
                  >
                    <ContactIcon path={contact.d} />
                    <span
                      style={{
                        color: GRIS,
                        fontSize: 8.5,
                        lineHeight: "12px",
                        overflow: "hidden",
                        whiteSpace: "normal", overflowWrap: "anywhere",
                      }}
                    >
                      {contact.t}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ textAlign: "center", marginTop: 16 }}>
              <span style={{ color: GRIS_MOYEN, fontSize: 8, lineHeight: "11px" }}>
                Carte personnelle — non transférable · Toute perte ou utilisation frauduleuse doit être signalée à AgriCapital.
              </span>
            </div>
          </div>
        </div>
      </CardShell>
    </div>
  );
});
CarteVerso.displayName = "CarteVerso";

export default CarteRecto;

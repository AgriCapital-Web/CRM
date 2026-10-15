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
import { OFFICIAL_ROLES, normalizeRoles } from "@/lib/roles";

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
  role_label?: string | null;
  role_codes?: string[];
  type_contrat?: string | null;
  statut_agent?: string | null;
  mission?: string | null;
  zone_intervention?: string | null;
  zone_intervention_label?: string | null;
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

const missionKey = (value?: string | null) =>
  (value || "").normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export const missionAuto = (carte: CarteData) => {
  const role = missionKey([carte.role_code, carte.role_label, carte.poste].filter(Boolean).join(" "));
  const department = missionKey(carte.departement);
  const storedMission = (carte.mission || "").trim();
  const sameAsFunction = storedMission && [carte.poste, carte.role_label, carte.role_code]
    .some((value) => value && missionKey(value) === missionKey(storedMission));

  // A mission entered in card settings is kept only when it describes an activity,
  // not when it merely repeats the person's title or role.
  if (storedMission && !sameAsFunction && missionKey(storedMission).length > 2) {
    return storedMission.length > 38 ? storedMission.slice(0, 35).trimEnd() + "…" : storedMission;
  }

  if (/pdg|president directeur general|directeur general|directrice generale/.test(role)) return "Piloter la stratégie et les équipes";
  if (/directeur commercial|directrice commerciale/.test(role)) return "Piloter les ventes et la relation client";
  if (/mobilisateur foncier/.test(role)) return "Identifier et sécuriser le foncier";
  if (/commercial|vente|prospect|business developer/.test(role) || /commercial/.test(department)) return "Développer les ventes et suivre les clients";
  if (/technique|technicien|agronom|terrain|plantation/.test(role) || /technique|exploitation/.test(department)) return "Suivre les plantations et les travaux";
  if (/operation|logistique/.test(role) || /operation|logistique/.test(department)) return "Coordonner les opérations quotidiennes";
  if (/finance|comptab|tresor|paiement/.test(role) || /finance|comptab/.test(department)) return "Suivre les finances et les paiements";
  if (/ressource humaine|rh|recrut/.test(role) || /ressource humaine|rh/.test(department)) return "Gérer le personnel et les recrutements";
  if (/informatique|informaticien|developpeur|systeme|reseau|digital|support technique/.test(role) || /informatique|digital|systeme/.test(department)) return "Maintenir les outils et services numériques";
  if (/communication|marketing/.test(role) || /communication|marketing/.test(department)) return "Renforcer la visibilité et la communication";
  if (/client|relation client|service client/.test(role) || /relation client/.test(department)) return "Accompagner les clients et leurs demandes";
  if (/administr|assistant|secretariat/.test(role) || /administr/.test(department)) return "Assurer le suivi administratif";
  return "Contribuer aux objectifs et activités du service";
};

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
      gridTemplateColumns: "176px minmax(0,1fr)",
      alignItems: "center",
      minHeight: 35,
      columnGap: 8,
      width: "100%",
      boxSizing: "border-box",
      borderBottom: `1px solid ${GRIS_CLAIR}`,
    }}
  >
    <span
      style={{
        color: VERT,
        fontSize: 13.5,
        fontWeight: 900,
        textTransform: "uppercase",
        letterSpacing: 0,
        lineHeight: "18px",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
    <span
      style={{
        color: GRIS,
        fontSize: value.length > 26 ? 10 : value.length > 21 ? 11 : value.length > 17 ? 12 : 14,
        fontWeight: 700,
        lineHeight: "18px",
        whiteSpace: "nowrap",
        overflowWrap: "normal",
        wordBreak: "normal",
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
  const isPdg = String(carte.role_code || "").toLowerCase() === "pdg";
  const fonction = isPdg ? "Président-Directeur Général" : carte.poste || carte.role_label || "—";
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
            padding: "18px 28px 18px",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 82, flexShrink: 0 }}>
            <img
              src={logo}
              alt="AgriCapital — Investir la terre. Cultiver l'avenir."
              style={{ display: "block", width: 310, maxWidth: "100%", height: 82, objectFit: "contain" }}
            />
          </div>

          <div style={{ marginTop: 7, textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 9, flexShrink: 0 }}>
            <span style={{ width: 32, height: 1, backgroundColor: GRIS_CLAIR, flexShrink: 0 }} />
            <img src={symbole} alt="" style={{ width: 25, height: 25, objectFit: "contain", display: "block", flexShrink: 0 }} />
            <span
              style={{
                color: VERT,
                fontSize: 14,
                fontWeight: 800,
                letterSpacing: 0.8,
                whiteSpace: "nowrap",
                textTransform: "uppercase",
              }}
            >
              Carte professionnelle
            </span>
            <span style={{ width: 32, height: 1, backgroundColor: GRIS_CLAIR, flexShrink: 0 }} />
          </div>

          <div
            style={{
              width: 166,
              height: 190,
              margin: "6px auto 0",
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
                style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center", display: "block" }}
              />
            ) : (
              <PhotoPlaceholder nom={nom} />
            )}
          </div>

          <div style={{ textAlign: "center", marginTop: 7, minHeight: 64, flexShrink: 0, paddingInline: 2 }}>
            <p
              style={{
                margin: 0,
                color: VERT,
                fontSize: nom.length > 42 ? 18 : nom.length > 34 ? 20 : nom.length > 26 ? 23 : 28,
                fontWeight: 900,
                lineHeight: "30px",
                textTransform: "uppercase",
                whiteSpace: "normal",
                overflowWrap: "break-word",
                wordBreak: "normal",
              }}
            >
              {nom}
            </p>
            <p
              style={{
                margin: "3px 0 0",
                color: GRIS_MOYEN,
                fontSize: 16,
                fontWeight: 800,
                lineHeight: "20px",
                textTransform: "uppercase",
                minHeight: 20,
                whiteSpace: "normal",
                overflowWrap: "break-word",
                wordBreak: "normal",
              }}
            >
              {fonction}
            </p>
          </div>

          <div style={{ display: "flex", justifyContent: "center", marginTop: 5, minHeight: 31, flexShrink: 0 }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 140,
                maxWidth: "100%",
                minHeight: 31,
                height: "auto",
                padding: "5px 18px",
                boxSizing: "border-box",
                borderRadius: 15,
                backgroundColor: VERT,
                color: BLANC,
                fontSize: 13,
                lineHeight: "17px",
                fontWeight: 900,
                letterSpacing: 0.5,
                textTransform: "uppercase",
                whiteSpace: "nowrap",
              }}
            >
              {isPdg ? "FONDATEUR" : statutAgentLabel(carte.statut_agent)}
            </span>
          </div>

          <div style={{ marginTop: 4, flexShrink: 0, width: "100%" }}>
            <InfoRow label="Identifiant" value={carte.matricule} />
            {isPdg ? (
              <>
                <InfoRow label="Fonction" value="Fondateur — PDG" />
                <InfoRow label="Mission" value="Direction générale et vision stratégique" />
                <InfoRow label="Vision stratégique" value="Développement agricole durable" />
                <InfoRow label="Innovation & développement" value="Solutions agricoles et numériques" />
              </>
            ) : (
              <>
                <InfoRow label={carte.zone_intervention_label || "Périmètre"} value={carte.zone_intervention || "Non renseigné"} />
                <InfoRow label="Mission" value={missionAuto(carte)} />
                <InfoRow label="Contrat" value={contratLabel(carte.type_contrat)} />
                <InfoRow label="Validité" value={validiteTexte(carte)} />
              </>
            )}
          </div>

          <div
            style={{
              marginTop: "auto",
              display: "grid",
              gridTemplateColumns: "1fr 226px",
              alignItems: "center",
              columnGap: 8,
              minHeight: 178,
              width: "100%",
              boxSizing: "border-box",
            }}
          >
            <div style={{ minWidth: 0, alignSelf: "center", paddingRight: 3 }}>
              <p style={{ margin: 0, color: VERT, fontSize: 14, lineHeight: "18px", fontWeight: 900 }}>
                AgriCapital S.A.R.L.
              </p>
              <p style={{ margin: "4px 0 0", color: GRIS, fontSize: 10.5, lineHeight: "14px", fontWeight: 700 }}>
                Société à responsabilité limitée
              </p>
              <p style={{ margin: "3px 0 0", color: GRIS_MOYEN, fontSize: 9.5, lineHeight: "13px" }}>
                RCCM de Côte d’Ivoire
              </p>
              <p style={{ margin: "3px 0 0", color: GRIS_MOYEN, fontSize: 9.5, lineHeight: "13px" }}>
                CI-DAL-01-2025-B12-13435
              </p>
              <p style={{ margin: "3px 0 0", color: GRIS_MOYEN, fontSize: 9.5, lineHeight: "13px" }}>
                Daloa-Gonaté, Côte d’Ivoire
              </p>
            </div>
            <div style={{ position: "relative", width: 226, height: 154, justifySelf: "end", flexShrink: 0 }}>
              <img
                src={signature}
                alt="Signature de la direction"
                style={{
                  position: "absolute",
                  zIndex: 1,
                  width: 250,
                  height: 82,
                  maxWidth: "none",
                  objectFit: "contain",
                  top: 2,
                  left: 10,
                  display: "block",
                }}
              />
              <img
                src={cachet}
                alt="Cachet AgriCapital"
                style={{
                  position: "absolute",
                  zIndex: 2,
                  width: 220,
                  height: "auto",
                  maxWidth: "none",
                  maxHeight: 137,
                  objectFit: "contain",
                  objectPosition: "left top",
                  top: 15,
                  left: 0,
                  display: "block",
                }}
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
            padding: "20px 30px 18px",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ display: "flex", justifyContent: "center", minHeight: 54 }}>
            <img
              src={logo}
              alt="AgriCapital — Investir la terre. Cultiver l'avenir."
              style={{ display: "block", width: 190, height: 54, objectFit: "contain" }}
            />
          </div>

          <div style={{ textAlign: "center", marginTop: 7 }}>
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
              marginTop: 12,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <QR code={carte.code_verification} size={322} />
          </div>

          <div style={{ textAlign: "center", marginTop: 14 }}>
            <p
              style={{
                margin: 0,
                color: GRIS,
                fontSize: 12,
                fontWeight: 600,
                lineHeight: "17px",
              }}
            >
              Scannez ce code avec votre téléphone pour vérifier l'authenticité et la validité de cette carte.
            </p>
            <div
              style={{
                marginTop: 10,
                padding: "9px 12px",
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
              marginTop: 12,
              padding: "10px 12px",
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
                <p style={{ margin: "6px 0 0", color: GRIS_MOYEN, fontSize: 10.5, lineHeight: "15px" }}>
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
                        fontSize: 10.5,
                        lineHeight: "14px",
                        minWidth: 0,
                        whiteSpace: "normal",
                        overflowWrap: "break-word",
                      }}
                    >
                      {contact.t}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ textAlign: "center", marginTop: 6 }}>
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

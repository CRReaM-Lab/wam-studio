/**
 * Avant d'écraser un son du Pi qui n'est pas à celui qui l'envoie (autre projet, autre piste,
 * lot, dépôt à la main) : dire à qui il est et demander. Le serveur refuse sans cet accord
 * (Agent.fs, `conflitDepot`) ; « Remplacer » relance l'envoi avec `remplacer`.
 */
const ID = "raspberry-demande-remplacement";

export function demanderRemplacement(message: string, existante: Record<string, unknown>): Promise<boolean> {
  document.getElementById(ID)?.remove();
  return new Promise((resoudre) => {
    const voile = document.createElement("div");
    voile.id = ID;
    Object.assign(voile.style, {
      position: "fixed", inset: "0", background: "rgba(0, 0, 0, 0.5)", zIndex: "3000",
      display: "flex", alignItems: "center", justifyContent: "center",
    });
    const boite = document.createElement("div");
    boite.setAttribute("role", "alertdialog");
    boite.setAttribute("aria-label", "Remplacer le son du Pi ?");
    Object.assign(boite.style, {
      background: "#1f252b", color: "#f1f1f1", border: "1px solid #3b4046", borderRadius: "10px",
      padding: "18px 20px", width: "440px", maxWidth: "calc(100vw - 32px)", boxSizing: "border-box",
      font: '14px "IBM Plex Sans", system-ui, sans-serif',
    });
    const titre = document.createElement("div");
    titre.textContent = "Remplacer le son du Pi ?";
    Object.assign(titre.style, { fontWeight: "600", fontSize: "15px", marginBottom: "8px" });
    const texte = document.createElement("div");
    texte.textContent = message;
    texte.style.color = "#ffc46b";
    boite.append(titre, texte);
    const effets = Array.isArray(existante.effets) ? (existante.effets as { nom?: string }[]).map((e) => e.nom).filter(Boolean) : [];
    if (effets.length) {
      const fx = document.createElement("div");
      fx.textContent = `Enregistré avec : ${effets.join(" → ")}.`;
      Object.assign(fx.style, { color: "#9aa1ab", fontSize: "12px", marginTop: "6px" });
      boite.append(fx);
    }
    const aide = document.createElement("div");
    aide.textContent = "Le remplacer change ce que joue /play pour tous ceux qui s'en servent. Pour garder les deux, envoyer sous un autre numéro.";
    Object.assign(aide.style, { color: "#9aa1ab", fontSize: "12px", margin: "10px 0 14px" });
    boite.append(aide);
    const actions = document.createElement("div");
    Object.assign(actions.style, { display: "flex", gap: "8px", justifyContent: "flex-end", flexWrap: "wrap" });
    const bouton = (libelle: string, principal: boolean, reponse: boolean) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = libelle;
      Object.assign(b.style, {
        minHeight: "44px", padding: "0 16px", borderRadius: "8px", cursor: "pointer", font: "inherit",
        border: principal ? "1px solid #b5651d" : "1px solid #3b4046",
        background: principal ? "#5a3412" : "#22272e", color: "#f1f1f1",
      });
      b.onclick = () => {
        voile.remove();
        resoudre(reponse);
      };
      return b;
    };
    const garder = bouton("Garder l'ancien", false, false);
    actions.append(garder, bouton("Remplacer", true, true));
    boite.append(actions);
    voile.append(boite);
    voile.addEventListener("click", (e) => {
      if (e.target === voile) {
        voile.remove();
        resoudre(false);
      }
    });
    document.body.append(voile);
    garder.focus();
  });
}

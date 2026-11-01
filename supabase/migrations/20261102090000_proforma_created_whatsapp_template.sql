update public.notification_automations
set contenu = E'Notification automatique\\n\\nBonjour {dernier_prenom_nom},\\n\\nNous vous remercions d’avoir choisi *AgriCapital* pour votre projet agricole.\\n\\nVotre devis « *{titre_du_devis}* » a bien été enregistré.\\n\\nPour le consulter, merci de vous rendre sur : https://services.agricapital.ci\\n\\n*AgriCapital* — _Investir la terre, cultiver l’avenir._',
    updated_at = now()
where evenement = 'proforma_independante_creee'
  and lower(canal) = 'whatsapp';

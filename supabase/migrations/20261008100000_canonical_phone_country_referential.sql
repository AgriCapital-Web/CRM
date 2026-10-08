-- Référentiel canonique des pays/indicatifs téléphoniques.
insert into public.referentiels_systeme (categorie, code, libelle, ordre, actif, metadata)
values
('pays_telephone','CI','Côte d’Ivoire',10,true,'{"flag":"🇨🇮","iso3":"CIV","callingCode":"+225","maxLocalDigits":10,"minLocalDigits":10}'::jsonb),
('pays_telephone','FR','France',20,true,'{"flag":"🇫🇷","iso3":"FRA","callingCode":"+33","maxLocalDigits":15,"minLocalDigits":7}'::jsonb),
('pays_telephone','US','États-Unis',30,true,'{"flag":"🇺🇸","iso3":"USA","callingCode":"+1","maxLocalDigits":15,"minLocalDigits":7}'::jsonb),
('pays_telephone','CA','Canada',31,true,'{"flag":"🇨🇦","iso3":"CAN","callingCode":"+1","maxLocalDigits":15,"minLocalDigits":7}'::jsonb),
('pays_telephone','BE','Belgique',40,true,'{"flag":"🇧🇪","iso3":"BEL","callingCode":"+32","maxLocalDigits":15,"minLocalDigits":7}'::jsonb),
('pays_telephone','CH','Suisse',50,true,'{"flag":"🇨🇭","iso3":"CHE","callingCode":"+41","maxLocalDigits":15,"minLocalDigits":7}'::jsonb),
('pays_telephone','GB','Royaume-Uni',60,true,'{"flag":"🇬🇧","iso3":"GBR","callingCode":"+44","maxLocalDigits":15,"minLocalDigits":7}'::jsonb),
('pays_telephone','SN','Sénégal',70,true,'{"flag":"🇸🇳","iso3":"SEN","callingCode":"+221","maxLocalDigits":15,"minLocalDigits":7}'::jsonb),
('pays_telephone','GN','Guinée',80,true,'{"flag":"🇬🇳","iso3":"GIN","callingCode":"+224","maxLocalDigits":15,"minLocalDigits":7}'::jsonb),
('pays_telephone','BF','Burkina Faso',90,true,'{"flag":"🇧🇫","iso3":"BFA","callingCode":"+226","maxLocalDigits":15,"minLocalDigits":7}'::jsonb),
('pays_telephone','ML','Mali',100,true,'{"flag":"🇲🇱","iso3":"MLI","callingCode":"+223","maxLocalDigits":15,"minLocalDigits":7}'::jsonb),
('pays_telephone','CM','Cameroun',110,true,'{"flag":"🇨🇲","iso3":"CMR","callingCode":"+237","maxLocalDigits":15,"minLocalDigits":7}'::jsonb),
('pays_telephone','TG','Togo',120,true,'{"flag":"🇹🇬","iso3":"TGO","callingCode":"+228","maxLocalDigits":15,"minLocalDigits":7}'::jsonb),
('pays_telephone','BJ','Bénin',130,true,'{"flag":"🇧🇯","iso3":"BEN","callingCode":"+229","maxLocalDigits":15,"minLocalDigits":7}'::jsonb)
on conflict (categorie, code) do update
set libelle=excluded.libelle, ordre=excluded.ordre, actif=true, metadata=excluded.metadata, updated_at=now();

delete from public.referentiels_systeme
where categorie='pays_telephone'
  and code not in ('CI','FR','US','CA','BE','CH','GB','SN','GN','BF','ML','CM','TG','BJ');
-- Référentiel unique pays/nationalités/indicatifs utilisé par CRM et Portail.
create temporary table _ac_pays_seed (code text, libelle text, indicatif text, ordre integer) on commit drop;
insert into _ac_pays_seed
select split_part(line,'|',1), split_part(line,'|',2), split_part(line,'|',3), ord::integer
from unnest(string_to_array($countries$AF|Afghanistan|+93
ZA|Afrique du Sud|+27
AL|Albanie|+355
DZ|Algérie|+213
DE|Allemagne|+49
AD|Andorre|+376
AO|Angola|+244
AG|Antigua-et-Barbuda|+1
SA|Arabie saoudite|+966
AR|Argentine|+54
AM|Arménie|+374
AU|Australie|+61
AT|Autriche|+43
AZ|Azerbaïdjan|+994
BS|Bahamas|+1
BH|Bahreïn|+973
BD|Bangladesh|+880
BB|Barbade|+1
BY|Bélarus|+375
BE|Belgique|+32
BZ|Belize|+501
BJ|Bénin|+229
BT|Bhoutan|+975
BO|Bolivie|+591
BA|Bosnie-Herzégovine|+387
BW|Botswana|+267
BR|Brésil|+55
BN|Brunéi|+673
BG|Bulgarie|+359
BF|Burkina Faso|+226
BI|Burundi|+257
CV|Cabo Verde|+238
KH|Cambodge|+855
CM|Cameroun|+237
CA|Canada|+1
CF|Centrafrique (République centrafricaine)|+236
CL|Chili|+56
CN|Chine|+86
CY|Chypre|+357
CO|Colombie|+57
KM|Comores|+269
CG|Congo|+242
CD|Congo (République démocratique du)|+243
KP|Corée du Nord|+850
KR|Corée du Sud|+82
CR|Costa Rica|+506
CI|Côte d’Ivoire|+225
HR|Croatie|+385
CU|Cuba|+53
DK|Danemark|+45
DJ|Djibouti|+253
DM|Dominique|+1
EG|Égypte|+20
AE|Émirats arabes unis|+971
EC|Équateur|+593
ER|Érythrée|+291
ES|Espagne|+34
EE|Estonie|+372
SZ|Eswatini|+268
US|États-Unis|+1
ET|Éthiopie|+251
FJ|Fidji|+679
FI|Finlande|+358
FR|France|+33
GA|Gabon|+241
GM|Gambie|+220
GE|Géorgie|+995
GH|Ghana|+233
GR|Grèce|+30
GD|Grenade|+1
GT|Guatemala|+502
GN|Guinée|+224
GW|Guinée-Bissau|+245
GQ|Guinée équatoriale|+240
GY|Guyana|+592
HT|Haïti|+509
HN|Honduras|+504
HU|Hongrie|+36
MH|Îles Marshall|+692
SB|Îles Salomon|+677
IN|Inde|+91
ID|Indonésie|+62
IQ|Irak|+964
IR|Iran|+98
IE|Irlande|+353
IS|Islande|+354
IL|Israël|+972
IT|Italie|+39
JM|Jamaïque|+1
JP|Japon|+81
JO|Jordanie|+962
KZ|Kazakhstan|+7
KE|Kenya|+254
KG|Kirghizistan|+996
KI|Kiribati|+686
KW|Koweït|+965
LA|Laos|+856
LS|Lesotho|+266
LV|Lettonie|+371
LB|Liban|+961
LR|Liberia|+231
LY|Libye|+218
LI|Liechtenstein|+423
LT|Lituanie|+370
LU|Luxembourg|+352
MK|Macédoine du Nord|+389
MG|Madagascar|+261
MY|Malaisie|+60
MW|Malawi|+265
MV|Maldives|+960
ML|Mali|+223
MT|Malte|+356
MA|Maroc|+212
MU|Maurice|+230
MR|Mauritanie|+222
MX|Mexique|+52
FM|Micronésie|+691
MD|Moldavie|+373
MC|Monaco|+377
MN|Mongolie|+976
ME|Monténégro|+382
MZ|Mozambique|+258
MM|Myanmar|+95
NA|Namibie|+264
NR|Nauru|+674
NP|Népal|+977
NI|Nicaragua|+505
NE|Niger|+227
NG|Nigeria|+234
NO|Norvège|+47
NZ|Nouvelle-Zélande|+64
OM|Oman|+968
UG|Ouganda|+256
UZ|Ouzbékistan|+998
PK|Pakistan|+92
PW|Palaos|+680
PS|Palestine|+970
PA|Panama|+507
PG|Papouasie-Nouvelle-Guinée|+675
PY|Paraguay|+595
NL|Pays-Bas|+31
PE|Pérou|+51
PH|Philippines|+63
PL|Pologne|+48
PT|Portugal|+351
QA|Qatar|+974
DO|République dominicaine|+1
CZ|République tchèque (Tchéquie)|+420
RO|Roumanie|+40
GB|Royaume-Uni|+44
RU|Russie|+7
RW|Rwanda|+250
KN|Saint-Christophe-et-Niévès|+1
LC|Sainte-Lucie|+1
SM|Saint-Marin|+378
VC|Saint-Vincent-et-les-Grenadines|+1
SV|Salvador (El Salvador)|+503
WS|Samoa|+685
ST|Sao Tomé-et-Principe|+239
SN|Sénégal|+221
RS|Serbie|+381
SC|Seychelles|+248
SL|Sierra Leone|+232
SG|Singapour|+65
SK|Slovaquie|+421
SI|Slovénie|+386
SO|Somalie|+252
SD|Soudan|+249
SS|Soudan du Sud|+211
LK|Sri Lanka|+94
SE|Suède|+46
CH|Suisse|+41
SR|Suriname|+597
SY|Syrie|+963
TJ|Tadjikistan|+992
TZ|Tanzanie|+255
TD|Tchad|+235
TH|Thaïlande|+66
TL|Timor-Leste|+670
TG|Togo|+228
TO|Tonga|+676
TT|Trinité-et-Tobago|+1
TN|Tunisie|+216
TR|Turquie|+90
TM|Turkménistan|+993
TV|Tuvalu|+688
UA|Ukraine|+380
UY|Uruguay|+598
VU|Vanuatu|+678
VA|Vatican (Saint-Siège)|+379
VE|Venezuela|+58
VN|Vietnam|+84
YE|Yémen|+967
ZM|Zambie|+260
ZW|Zimbabwe|+263$countries$, E'\n')) with ordinality as t(line,ord);

insert into public.referentiels_systeme (categorie,code,libelle,ordre,actif,metadata)
select 'pays_nationalite',code,libelle,ordre,true,jsonb_build_object('iso2',code)
from _ac_pays_seed
on conflict (categorie,code) do update set libelle=excluded.libelle,ordre=excluded.ordre,actif=true,metadata=excluded.metadata,updated_at=now();

insert into public.referentiels_systeme (categorie,code,libelle,ordre,actif,metadata)
select 'pays_telephone',code,libelle,ordre,true,jsonb_build_object('iso2',code,'callingCode',indicatif,'minLocalDigits',case when code='CI' then 10 else 7 end,'maxLocalDigits',case when code='CI' then 10 else 15 end)
from _ac_pays_seed
on conflict (categorie,code) do update set libelle=excluded.libelle,ordre=excluded.ordre,actif=true,metadata=excluded.metadata,updated_at=now();

delete from public.referentiels_systeme where categorie in ('pays_telephone','pays_nationalite') and code not in (select code from _ac_pays_seed);

-- Työntekijän kielivalinta ja litteroiden käännökset.
alter table public.profiles add column if not exists language text not null default 'fi';
alter table public.profiles drop constraint if exists profiles_language_check;
alter table public.profiles add constraint profiles_language_check check (language in ('fi','sq','en','uk'));

alter table public.litteras add column if not exists name_sq text;
alter table public.litteras add column if not exists name_en text;
alter table public.litteras add column if not exists name_uk text;

update public.litteras l set name_sq=v.sq,name_en=v.en,name_uk=v.uk
from (values
 ('1100','Punime prishjeje','Demolition work','Демонтажні роботи'),
 ('1200','Punime tokësore','Earthworks','Земляні роботи'),
 ('2100','Themele dhe veshje përforcuese','Footings and jacketing','Фундаменти та підсилювальні обойми'),
 ('3000','Struktura mbajtëse','Structural frames','Несучі конструкції'),
 ('3620','Ballkone, kallëp dhe betonim','Balconies, formwork and casting','Балкони, опалубка та бетонування'),
 ('3650','Ballkone elementesh','Precast balconies','Збірні балкони'),
 ('3760','Struktura druri e çatisë','Timber roof framing','Дерев’яний каркас даху'),
 ('3765','Strehë hyrjeje','Entrance canopies','Вхідні навіси'),
 ('3770','Çati ballkonesh','Balcony roofs','Дахи балконів'),
 ('3775','Zgjatje strehësh','Eaves extensions','Подовження карнизів'),
 ('5036','Punime llamarine','Sheet-metal work','Бляшані роботи'),
 ('5150','Kullimi i ujit','Water drainage','Водовідведення'),
 ('5546','Suvatim','Plastering','Штукатурні роботи'),
 ('5550','Fuga elastike','Elastic joint sealing','Еластичне герметизування швів'),
 ('5560','Konstruksion dhe veshje fasade','Facade framing and cladding','Каркас і облицювання фасаду'),
 ('5590','Suvatim me izolim','Insulated rendering','Штукатурний фасад з утепленням'),
 ('5600','Suvatim mbi pllaka','Board rendering','Штукатурка по плитах'),
 ('5750','Punime me njësi','Unit-based work','Одиничні роботи'),
 ('5805','Rërëzim dhe larje me presion të lartë','Sandblasting and high-pressure washing','Піскоструминне та високонапірне миття'),
 ('5810','Nivelim i përgjithshëm','Overall levelling','Суцільне вирівнювання'),
 ('5815','Lyerje dhe veshje','Painting and coating','Фарбування та нанесення покриттів'),
 ('8150','Rrethim dhe mbrojtje kalimi','Fencing and access protection','Огородження та захист проходів'),
 ('8160','Punë ndihmëse, mbrojtje dhe pastrim','Assistance, protection and cleaning','Допоміжні роботи, захист і прибирання'),
 ('8180','Skela dhe pajisje ngritëse','Scaffolding and lifts','Риштування та підйомники'),
 ('8200','Hapja dhe mbyllja e kantierit','Site setup and close-down','Організація та закриття будмайданчика')
) as v(code,sq,en,uk) where l.code=v.code;

comment on column public.profiles.language is 'Työntekijän käyttöliittymän kieli: fi, sq, en tai uk';

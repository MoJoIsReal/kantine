-- Eksempelmeny slik at systemet kan proves ut med en gang.
-- Endre eller slett alt dette fra /admin når dere lager deres egen meny.
-- Kjør med: npm run db:seed

DELETE FROM ordrelinjer;
DELETE FROM hendelser;
DELETE FROM ordrer;
DELETE FROM varer;
DELETE FROM kategorier;
DELETE FROM hentetider;

INSERT INTO kategorier (id, navn, sortering) VALUES
  (1, 'Baguetter og rundstykker', 10),
  (2, 'Varmmat', 20),
  (3, 'Snacks', 30),
  (4, 'Drikke', 40);

INSERT INTO varer (kategori_id, navn, beskrivelse, emoji, pris_ore, antall_igjen, sortering) VALUES
  (1, 'Baguette med skinke og ost', 'Nybakt, med salat og agurk',    '🥖', 3500,   20, 10),
  (1, 'Baguette med kylling',       'Kylling, majones og salat',     '🥪', 4000,   15, 20),
  (1, 'Rundstykke med brunost',     'Klassikeren',                   '🧀', 2000,   30, 30),
  (2, 'Dagens suppe',               'Se oppslagstavla for dagens',   '🍲', 3000,   25, 10),
  (2, 'Pizzasnurr',                 'Hjemmelaget, varm',             '🍕', 2500,   24, 20),
  (3, 'Frukt',                      'Eple, banan eller appelsin',    '🍎', 1000, NULL, 10),
  (3, 'Yoghurt',                    'Naturell eller bær',            '🍨', 1500,   12, 20),
  (4, 'Vann 0,5 l',                 '',                              '💧', 1500, NULL, 10),
  (4, 'Melk',                       'Lettmelk eller sjokolademelk',  '🥛', 1500, NULL, 20),
  (4, 'Kakao',                      'Varm, med krem',                '☕', 2000, NULL, 30);

INSERT INTO hentetider (navn, frist, sortering) VALUES
  ('Friminutt 09:35', '09:25', 10),
  ('Storefri 11:05',  '10:50', 20),
  ('Friminutt 12:45', '12:35', 30);

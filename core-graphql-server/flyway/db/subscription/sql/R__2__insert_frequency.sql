--citest/watchlist.js

INSERT INTO public.frequency (frequency_id,frequency_name) VALUES 
(1,'immediate')
,(2,'daily')
,(3,'weekly')
,(4,'never')
ON CONFLICT DO NOTHING
;
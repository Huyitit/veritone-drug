UPDATE job_new.engine_category
 SET export_formats = (CASE
 	
 	WHEN (export_formats::jsonb @> '[{"label": "Word Document", "types": [], "format": "doc"}]'::jsonb) = FALSE
 		AND (export_formats::jsonb @> '[{"label": "Word Document", "types": [], "format": "docx"}]'::jsonb) = FALSE
  		then export_formats || '[{"label": "Word Document", "types": [], "format": "doc"}, {"label": "Word Document", "types": [], "format": "docx"}]'::jsonb
 	WHEN (export_formats::jsonb @> '[{"label": "Word Document", "types": [], "format": "doc"}]'::jsonb) = FALSE
 		AND (export_formats::jsonb @> '[{"label": "Word Document", "types": [], "format": "docx"}]'::jsonb) = TRUE
  		then export_formats || '[{"label": "Word Document", "types": [], "format": "doc"}]'::jsonb
  
	WHEN (export_formats::jsonb @> '[{"label": "Word Document", "types": [], "format": "doc"}]'::jsonb) = TRUE
		AND (export_formats::jsonb @> '[{"label": "Word Document", "types": [], "format": "docx"}]'::jsonb) = FALSE
		then  export_formats || '[{"label": "Word Document", "types": [], "format": "docx"}]'::jsonb
	ELSE export_formats
  END)

WHERE engine_category_id = '67cd4dd0-2f75-445d-a6f0-2f297d6cd182' and engine_category_name = 'Transcription'
RETURNING *; 
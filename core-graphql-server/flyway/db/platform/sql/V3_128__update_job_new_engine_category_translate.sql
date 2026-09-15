-- Update translate category to allow edit and export in CMS
UPDATE
    job_new.engine_category
SET
    editable = true,
    export_formats = '[{"label": "Plain Text", "types": [], "format": "txt"}, {"label": "Word Document", "types": [], "format": "doc"}, {"label": "Word Document", "types": [], "format": "docx"}, {"label": "Time Text Markup Language", "types": [], "format": "ttml"}, {"label": "WebVTT", "types": ["subtitle"], "format": "vtt"}, {"label": "SubRip Text", "types": ["subtitle"], "format": "srt"}, {"label": "Plain Text for Avid", "types": [], "format": "txtAvid"}]'
WHERE
    engine_category_id = '3b2b2ff8-44aa-4db4-9b71-ff96c3bf5923';

-- table to store legacy treeObjectId references until all external
-- stores that have such references are updated
CREATE TABLE IF NOT EXISTS public.v2_folder_treeobject (
 	folder_id uuid NOT NULL REFERENCES public.v2_folder (folder_id) ON DELETE CASCADE,
	tree_object_id uuid NOT NULL,
    date_created TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

	PRIMARY KEY (folder_id, tree_object_id)
);
ALTER TABLE public.v2_folder_treeobject
    OWNER TO postgres;

CREATE INDEX IF NOT EXISTS idx_v2_folder_treeobject ON public.v2_folder_treeobject (tree_object_id);


-- missed during previous migrations
ALTER TABLE public.v2_folder_sdo
    OWNER TO postgres;

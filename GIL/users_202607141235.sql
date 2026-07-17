INSERT INTO public.users (username,password_hash,full_name,email,"role",is_active,created_at) VALUES
	 ('admin','ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f','Administrator','admin@gil.com','ADMIN'::public.user_role_enum,1,'2026-03-17 13:26:23'),
	 ('kannan','26a2fe2c51befcfe23b230e5dc3e91a497d547b965538ddbb21d21d75aabbbbc','R Kannan','rkannan@graphiteindia.com','VIEWER'::public.user_role_enum,1,'2026-04-07 16:30:42');

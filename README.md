# Portfolio de David Silvera - Data Scientist & AI Developer

## 🚀 Descripción

Este es un portfolio profesional construido con tecnologías modernas que muestra mis habilidades y experiencia como Científico de Datos y Desarrollador de IA. El sitio está diseñado para ofrecer una experiencia de usuario fluida y atractiva, con características como modo oscuro, animaciones suaves y diseño responsivo.

## ✨ Características Principales

- **Diseño Moderno y Responsivo**: Adaptable a todos los dispositivos
- **Modo Oscuro/Claro**: Cambio de tema con animaciones suaves
- **Secciones Principales**:
  - Hero Section con animaciones
  - Servicios de IA
  - Proyectos destacados
  - Testimonios de clientes
  - Blog integrado
  - Formulario de contacto

## 🛠️ Tecnologías Utilizadas

- **Framework**: Astro
- **Estilos**: Tailwind CSS
- **Lenguajes**:
  - TypeScript
  - JavaScript
  - HTML/CSS
- **Características Adicionales**:
  - View Transitions API
  - RSS Feed
  - Markdown para blog posts
  - Sistema de colecciones de contenido

## 📦 Estructura del Proyecto

```bash 
src/
├── components/
│ ├── layout/
│ ├── sections/
│ └── ui/
├── content/
│ └── blog/
├── pages/
├── styles/
└── consts.ts
``` 

## 🚀 Instalación y Uso

1. Clonar el repositorio:

git clone https://github.com/DavidSilveraGabriel/nebulous-neutron.git

2. Instalar dependencias:

npm install

3. Ejecutar en desarrollo:

npm run dev 

4. Construir para producción:

### embedding creations for supabase
```SQL 

-- Habilitar extensión pgvector
create extension if not exists vector;

-- Tabla principal de embeddings
create table content_embeddings (
  id uuid primary key default gen_random_uuid(),
  file_path text not null unique,
  content text not null,
  embeddings vector(768) not null,
  metadata jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Índice para búsqueda por similitud
create index content_embeddings_embedding_idx
  on content_embeddings
  using ivfflat (embeddings vector_cosine_ops)
  with (lists = 100);

-- Trigger para actualizar automáticamente updated_at
create or replace function update_modified_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_content_embeddings_modtime
before update on content_embeddings
for each row
execute procedure update_modified_column();
``` 


## 💼 Servicios Ofrecidos

- **LLMs Empresariales**: Desde $10,000 USD
- **Automatización con IA**: Desde $5,000 USD
- **Consultoría en IA**: Desde $3,000 USD/mes

## 📝 Blog

El sitio incluye una sección de blog con:
- Categorización por tags
- Tiempo estimado de lectura
- Imágenes destacadas
- Sistema de borradores

## 🌐 SEO y Rendimiento

- Meta tags optimizados
- Open Graph tags
- Integración con Google Analytics
- RSS Feed

## 📱 Redes Sociales

- GitHub: [@DavidSilveraGabriel](https://github.com/DavidSilveraGabriel)
- Twitter: [@David_Silvera21](https://twitter.com/David_Silvera21)
- LinkedIn: [davidsilveragabriel](https://www.linkedin.com/in/davidsilveragabriel/)
- YouTube: [@SilveraDavid](https://www.youtube.com/@SilveraDavid)
- Instagram: [@davidsilverag](https://www.instagram.com/davidsilverag/)

## 🤝 Contribuciones

Las contribuciones son bienvenidas. Por favor, abre un issue primero para discutir los cambios que te gustaría realizar.

## 📄 Licencia

Este proyecto está bajo la Licencia MIT. Ver el archivo `LICENSE` para más detalles.

## 📞 Contacto

Para consultas sobre proyectos o colaboraciones, puedes contactarme por WhatsApp.
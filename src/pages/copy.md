
//Base.astro

---
import '../styles/global.css';
import Header from '../components/Header.astro';
import Footer from '../components/Footer.astro';
import FormForProject from '../components/FormForProject.astro';
import { ViewTransitions } from "astro:transitions";

const { pageTitle } = Astro.props; //const pageTitle = "index";

---

<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0">
		<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
		<meta name="viewport" content="width=device-width" />
		<meta name="generator" content={Astro.generator} />
		<title>{pageTitle}</title>
		<ViewTransitions />

	</head>
	<body>
		<Header />	
		<h1 transition:animate="slide">{pageTitle}</h1>
			<slot />

		<Footer />
		{/*<FormForProject />*/}
		<script>
			import "../scripts/menu.js";
		</script>
	</body>
</html>

//global.css

@import "tailwindcss/base";
@import "tailwindcss/components";
@import "tailwindcss/utilities";

html {
    background-color: #f1f5f9;
    font-family: sans-serif;
  }
  
body {
    margin: 0;
    width: 100%;
    padding: 1rem;
    line-height: 1.5;
    align-items: center;
    justify-content: center;
}

* {
    box-sizing: border-box;
}

h1 {
    margin: 1rem 0;
    font-size: 2.5rem;
}

/* nav styles */
.hamburger {
    padding-right: 17px;
    cursor: pointer;
    margin-left: 22rem;
}

.hamburger .line {
    display: flex;
    width: 40px;
    height: 2px;
    margin-bottom: 10px;
    background-color: #363534;
}

.nav-links {
width: 100%;
top: 5rem;
left: 48px;
background-color: #ff9776;
display: none;
margin: 0;
}

.nav-links a {
display: flex;
text-align: center;
padding: 10px 0;
text-decoration: none;
font-size: 1rem;
font-weight: bold;
text-transform: uppercase;
}

a {
    color: #b2b7bb;
  }

  .tags {
    display: flex;
    flex-wrap: wrap;
    margin: 0 auto;
  }

  .tag {
    margin: 0.25em;
    border: dotted 1px #a1a1a1;
    border-radius: 0.5em;
    padding: 0.5em 1em;
    font-size: 1.15em;
    background-color: #f8fcfd;
  }
.nav-links a:hover, a:focus {
background-color: #ff9776;
}

.expanded {
display: unset;
}

@media screen and (min-width: 636px) {
.nav-links {
    margin-left: 5em;
    display: block;
    position: static;
    width: auto;
    background: none;
}

.nav-links a {
    display: inline-block;
    padding: 15px 20px;
}

.hamburger {
    display: none;
}
}

html.dark {
    background-color: #0d0950;
    color: #fff;
  }
  
  .dark .nav-links a {
    color: #fff;
  }

//Navigation.astro

---
---
<div transition:animate="slide" class="nav-links">
    <a href="/">Home</a>
    <a href="/blog">Blog</a>
    <a href="/tags/">Tags</a>
  </div>

// Header.astro

---
import Navigation from './Navigation.astro';
import Hamburger from './Hamburger.astro';
import ThemeIcon from './ThemeIcon.astro';

---
<header>
  <nav>
    <Hamburger />
    <ThemeIcon />
    <Navigation />
  </nav>
</header>


// Estructura

src --> assets --> DAVID.png
    --> components [BlogPost.astro, Footer.astro,Hamburger.astro,Hearder.astro,Navigation.astro,NotFound.astro,Testimonials.astro,ThemeIcon.astro]
    --> content [Posts(posts en .md), config.ts]
    --> pages [posts(carpeta con [...slug].astro),tags(carpeta con [tag.astro y index.astro]),blog.astro,index.astro,rss.xml.js]
    --> scripts [menu.js]
    --> styles [global.css]
    --> templates [Base.astro,MarkdownPost.astro]


// post

---
title: 'My First Blog Post'
pubDate: 2022-07-01
description: 'This is the first post of my new Astro blog.'
author: 'Astro Learner'
image:
    url: 'https://docs.astro.build/assets/rose.webp'
    alt: 'The Astro logo on a dark background with a pink glow.'
tags: ["astro", "blogging", "learning in public"]
---

## What I've accomplished

1. **Installing Astro**: First, I created a new Astro project and set up my online accounts.

2. **Making Pages**: I then learned how to make pages by creating new `.astro` files and placing them in the `src/pages/` folder.

3. **Making Blog Posts**: This is my first blog post! I now have Astro pages and Markdown posts!

## What's next

I will try finish the Astro tutorial, and then keep adding more posts. Watch this space for more to come.

// post 2 

---
title: My Second Blog Post
author: Astro Learner
description: "After learning some Astro, I couldn't stop!"
image:
    url: "https://docs.astro.build/assets/arc.webp"
    alt: "The Astro logo on a dark background with a purple gradient arc."
pubDate: 2022-07-08
tags: ["astro", "blogging", "learning in public", "successes"]
---
After a successful first week learning Astro, I decided to try some more. I wrote and imported a small component from memory!

// ThemeIcon.astro

---
---
<button id="themeToggle">
    <svg width="30px" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <path class="sun" fill-rule="evenodd" d="M12 17.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11zm0 1.5a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm12-7a.8.8 0 0 1-.8.8h-2.4a.8.8 0 0 1 0-1.6h2.4a.8.8 0 0 1 .8.8zM4 12a.8.8 0 0 1-.8.8H.8a.8.8 0 0 1 0-1.6h2.5a.8.8 0 0 1 .8.8zm16.5-8.5a.8.8 0 0 1 0 1l-1.8 1.8a.8.8 0 0 1-1-1l1.7-1.8a.8.8 0 0 1 1 0zM6.3 17.7a.8.8 0 0 1 0 1l-1.7 1.8a.8.8 0 1 1-1-1l1.7-1.8a.8.8 0 0 1 1 0zM12 0a.8.8 0 0 1 .8.8v2.5a.8.8 0 0 1-1.6 0V.8A.8.8 0 0 1 12 0zm0 20a.8.8 0 0 1 .8.8v2.4a.8.8 0 0 1-1.6 0v-2.4a.8.8 0 0 1 .8-.8zM3.5 3.5a.8.8 0 0 1 1 0l1.8 1.8a.8.8 0 1 1-1 1L3.5 4.6a.8.8 0 0 1 0-1zm14.2 14.2a.8.8 0 0 1 1 0l1.8 1.7a.8.8 0 0 1-1 1l-1.8-1.7a.8.8 0 0 1 0-1z"/>
      <path class="moon" fill-rule="evenodd" d="M16.5 6A10.5 10.5 0 0 1 4.7 16.4 8.5 8.5 0 1 0 16.4 4.7l.1 1.3zm-1.7-2a9 9 0 0 1 .2 2 9 9 0 0 1-11 8.8 9.4 9.4 0 0 1-.8-.3c-.4 0-.8.3-.7.7a10 10 0 0 0 .3.8 10 10 0 0 0 9.2 6 10 10 0 0 0 4-19.2 9.7 9.7 0 0 0-.9-.3c-.3-.1-.7.3-.6.7a9 9 0 0 1 .3.8z"/>
    </svg>
  </button>
  
  <style>
    #themeToggle {
      border: 0;
      background: none;
    }
    .sun { fill: black; }
    .moon { fill: transparent; }
  
    :global(.dark) .sun { fill: transparent; }
    :global(.dark) .moon { fill: white; }
  </style>

  <script>
    document.addEventListener('astro:page-load', () => {
  const theme = (() => {
    if (typeof localStorage !== "undefined" && localStorage.getItem("theme")) {
      return localStorage.getItem("theme");
    }
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
    return "light";
  })();

  if (theme === "light") {
    document.documentElement.classList.remove("dark");
  } else {
    document.documentElement.classList.add("dark");
  }

  // Comprobación de nulidad antes de establecer el tema
  if (theme) {
    window.localStorage.setItem("theme", theme);
  }

  const handleToggleClick = () => {
    const element = document.documentElement;
    element.classList.toggle("dark");

    const isDark = element.classList.contains("dark");
    localStorage.setItem("theme", isDark ? "dark" : "light");
  };

  const themeToggle = document.getElementById("themeToggle");
  if (themeToggle instanceof HTMLElement) {
    themeToggle.onclick = handleToggleClick;
  }
});
  </script>

<script is:inline>
    function applyTheme() {
      localStorage.theme === 'dark'
        ? document.documentElement.classList.add("dark")
        : document.documentElement.classList.remove("dark");
    }
  
    document.addEventListener('astro:after-swap', applyTheme);
    applyTheme();
  </script>

// Hamburger.astro
---
---
<div class="hamburger">
    <span class="line"></span>
    <span class="line"></span>
    <span class="line"></span>
  </div>
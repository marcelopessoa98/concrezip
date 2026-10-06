import "./styles/global.css";
import "./styles/components.css";
import { mountApp } from "./ui/app";

const container = document.querySelector<HTMLElement>("#app");
if (!container) throw new Error("Não foi possível iniciar a aplicação.");
mountApp(container);

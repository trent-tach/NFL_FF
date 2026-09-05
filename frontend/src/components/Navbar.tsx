import { Link } from "react-router-dom";
import NavDropdown from "./NavDropdown";

export default function Navbar() {
    return (
        <header className="border-b border-border">
                <nav className="mx-auto w-full max-w-6xl px-6 h-16 flex items-center gap-1">

            <Link to="/" className="mr-6 text-lg font-bold">FF</Link>

            <NavDropdown label="NFL" items={[
                { to: "/games", label: "Games" },
                { to: "/schedule", label: "maybe roster/player" },
            ]} />

            <NavDropdown label="Fantasy" items={[
                { to: "/myleagues", label: "My leagues"},
                { to: "/create", label: "Create League" },
                { to: "/join", label: "Join League"}
            ]} />

            <NavDropdown label="Tools" items={[
                {to: "/draft", label: "Mock Draft"},
                {to: "/season", label: "In season advice"},
                {to: "/intel", label: "Intel"}
            ]} />

              <NavDropdown label="Rankings" items={[
                {to: "/redraft", label: "Redraft Rankings"},
                {to: "/Dynasty", label: "Dynasty Rankings"}
            ]} />

            <Link to="news" className="mr-6 text-lg font-bold">News</Link>
            </nav>
        </header >
    );
}
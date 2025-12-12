import React from "react";
import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";
import Home from "./pages/Home";
import Library from "./pages/Library";
import Reader from "./pages/Reader";

export default function App() {
  return (
    <Router>
      <nav style={{ padding: "10px", borderBottom: "1px solid #ccc" }}>
        <Link to="/" style={{ marginRight: "10px" }}>Acceuil</Link>
              <Link to="/library">Bibliotheque</Link>
      </nav>
      <Routes>
        <Route path="/" element={<Home />} />
              <Route path="/library" element={<Library />} />
              <Route path="/reader/:id" element={<Reader />} />
      </Routes>
    </Router>
  );
}

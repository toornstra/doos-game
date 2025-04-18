const express = require("express");
const app = express();
const http = require("http").createServer(app);
const { Server } = require("socket.io");
const io = new Server(http);
const path = require("path");
const xlsx = require("xlsx");
const PORT = 3000;

app.use(express.static("public"));

// 🔀 Selecteer 10 random stellingen uit de volledige lijst
function getRandomStellingen(alleStellingen, aantal = 10) {
  const shuffled = [...alleStellingen].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, aantal);
}


let lobbies = {};
let stellingData = [];

// 🟢 Laad Excel bestand bij opstart
try {
  const workbook = xlsx.readFile(path.join(__dirname, "data", "muur.xlsx"));
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const jsonData = xlsx.utils.sheet_to_json(sheet);
  stellingData = jsonData.map(row => row.stelling).filter(Boolean);
  console.log(`✅ ${stellingData.length} stellingen geladen.`);
} catch (err) {
  console.error("❌ Fout bij laden van stellingen:", err);
}

io.on("connection", (socket) => {
  console.log("Nieuwe gebruiker verbonden:", socket.id);

// 🗳️ Stemmen ontvangen
socket.on("stem", ({ lobbyId, username, keuze }) => {
console.log("Ontvangen stem event:", { lobbyId, username, keuze });
  const lobby = lobbies[lobbyId];
  if (!lobby) return;

  const index = lobby.currentStellingIndex.toString();
  if (!lobby.stemmen[index]) {
    lobby.stemmen[index] = {};
  }

  // Alleen stemmen als je nog niet gestemd hebt
  if (!lobby.stemmen[index][username]) {
    lobby.stemmen[index][username] = keuze;
    console.log(`${username} stemde ${keuze} op stelling ${index}`);
  }
});

  // 🏠 Lobby aanmaken
socket.on("createLobby", (username) => {
  const lobbyId = Math.floor(100000 + Math.random() * 900000).toString();
  lobbies[lobbyId] = {
    players: [username],
    currentStellingIndex: 0,
    stellingen: getRandomStellingen(stellingData),
    stemmen: {}
  };

  socket.join(lobbyId);
  io.to(socket.id).emit("lobbyCreated", lobbyId);
  console.log(`Lobby ${lobbyId} aangemaakt door ${username}`);
});


  // 👥 Joinen van een lobby
  socket.on("joinLobby", ({ lobbyId, username }) => {
    if (lobbies[lobbyId]) {
      lobbies[lobbyId].players.push(username);
      socket.join(lobbyId);
      io.to(socket.id).emit("lobbyJoined", lobbyId);
      console.log(`${username} heeft lobby ${lobbyId} gejoined`);
    } else {
      io.to(socket.id).emit("error", "Lobby bestaat niet");
    }
  });

  // 👀 Speler op de lobbypagina
  socket.on("joinLobbyPage", ({ lobbyId, username }) => {
    socket.join(lobbyId);
    if (lobbies[lobbyId]) {
      if (!lobbies[lobbyId].players.includes(username)) {
        lobbies[lobbyId].players.push(username);
      }

      if (lobbies[lobbyId].players[0] === username) {
        io.to(socket.id).emit("youAreHost");
      }

      io.to(lobbyId).emit("updatePlayerList", lobbies[lobbyId].players);
      console.log(`${username} is op de lobby pagina van ${lobbyId}`);
    }
  });

  // ▶️ Spel starten
  socket.on("startGame", (lobbyId) => {
    io.to(lobbyId).emit("gameStarted");
    console.log(`Spel gestart in lobby ${lobbyId}`);
  });

  // 🔁 Stelling tonen
  socket.on("getCurrentStelling", (lobbyId) => {
    const index = lobbies[lobbyId]?.currentStellingIndex ?? 0;
    io.to(lobbyId).emit("showStelling", lobbies[lobbyId].stellingen[index] || "Geen stelling");
  });

  // ⬅️➡️ Stelling wisselen (door host)
socket.on("changeStelling", ({ lobbyId, direction }) => {
  const lobby = lobbies[lobbyId];
  if (!lobby) return;

  const index = lobby.currentStellingIndex.toString();

  if (direction === "next") {
    // Eerst resultaten laten zien
    const stemmen = lobby.stemmen[index] || {};
    const stemmenArray = Object.entries(stemmen); // [["Piet", "overrated"], ["Sanne", "underrated"]]

    let overrated = 0;
    let underrated = 0;

    console.log("Stemmen ontvangen:", stemmenArray);
    stemmenArray.forEach(([_, stem]) => {
      const normalized = stem.toLowerCase();
      if (normalized === "overrated") overrated++;
      if (normalized === "underrated") underrated++;
    });

    let resultaat = "Rightly rated";
    if (overrated > underrated) resultaat = "overrated";
    else if (underrated > overrated) resultaat = "underrated";

    io.to(lobbyId).emit("showResultaat", {
      resultaat,
      stemmen: stemmenArray
    });

    console.log(`Resultaat voor stelling ${index} in lobby ${lobbyId}: ${resultaat}`);
  }

  if (direction === "prev" && lobby.currentStellingIndex > 0) {
    lobby.currentStellingIndex--;
    const vorigeStelling = stellingData[lobby.currentStellingIndex] || "Geen stelling";
    io.to(lobbyId).emit("showStelling", vorigeStelling);
  }
});

// Nieuwe event om de volgende stelling handmatig te starten
socket.on("nextStelling", (lobbyId) => {
  const lobby = lobbies[lobbyId];
  if (!lobby) return;

  const index = lobby.currentStellingIndex.toString();
  const stemmen = lobby.stemmen[index] || {};
  const stemmenArray = Object.entries(stemmen);

  let overrated = 0;
  let underrated = 0;

  stemmenArray.forEach(([_, stem]) => {
    const normalized = stem.toLowerCase();
    if (normalized === "overrated") overrated++;
    if (normalized === "underrated") underrated++;
  });

  let resultaat = "Rightly rated";
  if (overrated > underrated) resultaat = "overrated";
  else if (underrated > overrated) resultaat = "underrated";

  // Alleen resultaat laten zien
  io.to(lobbyId).emit("showResultaat", {
    resultaat,
    stemmen: stemmenArray
  });

  console.log(`Resultaat voor stelling ${index} in lobby ${lobbyId}: ${resultaat}`);
});


socket.on("toonVolgendeStelling", (lobbyId) => {
  const lobby = lobbies[lobbyId];
  if (!lobby) return;

  // Controleer of we bij de laatste stelling zijn
  if (lobby.currentStellingIndex < lobby.stellingen.length - 1) {
    // Ga naar de volgende stelling
    lobby.currentStellingIndex++;
    const nieuweStelling = lobby.stellingen[lobby.currentStellingIndex] || "Geen stelling";
    io.to(lobbyId).emit("showStelling", nieuweStelling);
  } else {
    // Wanneer de laatste stelling bereikt is, toon het resultaat
    io.to(lobbyId).emit("showResultaat", {
      resultaat: "Het spel is afgelopen!",
      stemmen: []  // Geef de stemmen voor de laatste stelling als leeg weer
    });

    // Toon de resultaten van alle stellingen
    showAllResults(lobbyId);

    // Eindig het spel
    io.to(lobbyId).emit("endGame", "Het spel is afgelopen!");
  }
});



socket.on("allResults", (resultaten) => {
  console.log("Alle resultaten:", resultaten);
  
  // Zorg ervoor dat de resultaten goed worden weergegeven in de frontend
  const resultContainer = document.getElementById("result-container");
  resultContainer.innerHTML = "";  // Maak de container leeg voordat je nieuwe resultaten toevoegt
  
  // Loop door de resultaten en voeg ze toe aan de container
  resultaten.forEach((resultaat) => {
    const div = document.createElement("div");
    div.innerHTML = `
      <p><strong>Stelling:</strong> ${resultaat.stelling}</p>
      <p><strong>Resultaat:</strong> ${resultaat.resultaat}</p>
      <p><strong>Stemmen:</strong></p>
      <ul>
        ${resultaat.stemmen.map(([username, stem]) => `<li>${username}: ${stem}</li>`).join("")}
      </ul>
    `;
    resultContainer.appendChild(div);
  });
});



});

// Functie om alle resultaten te tonen
function showAllResults(lobbyId) {
  const lobby = lobbies[lobbyId];
  if (!lobby) return;

  const resultaten = [];

  // Loop door alle stellingen
  for (let i = 0; i < lobby.stellingen.length; i++) {
    const stemmen = lobby.stemmen[i.toString()] || {};
    const stemmenArray = Object.entries(stemmen);

    let overrated = 0;
    let underrated = 0;

    stemmenArray.forEach(([_, stem]) => {
      const normalized = stem.toLowerCase();
      if (normalized === "overrated") overrated++;
      if (normalized === "underrated") underrated++;
    });

    let resultaat = "Rightly rated";
    if (overrated > underrated) resultaat = "overrated";
    else if (underrated > overrated) resultaat = "underrated";

    // Voeg het resultaat van de stelling toe aan de lijst
    resultaten.push({
      stelling: lobby.stellingen[i],
      resultaat: resultaat,
      stemmen: stemmenArray
    });
  }

  // Toon alle resultaten aan de lobby
  io.to(lobbyId).emit("allResults", resultaten);
}


http.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server draait op http://0.0.0.0:${PORT}`);
});


# sthlm-med

sthlm-med samlar svenska medicinska kunskapsstöd, läkemedelsinformation, kalkylatorer och lediga vårdplatser i en Android-app.

Appen kräver Android 8.0 eller senare och internetanslutning för att hämta webbsidor och vårdplatsuppgifter.

## Kunskapsstöd och kalkylatorer

- **Kunskapsstöd för vårdgivare**, **Giftinformationscentralen**, **FASS**, **Janusinfo** och **Internetmedicin**
  har egna genvägar i verktygsfältet längst ned.
- **Kalkylatorer** öppnar en meny med **ABG bench** och **IM kalkylatorer**.

Varje webbplats behåller sin öppna sida, historik och position i texten vid byte mellan källor.
Ett långt tryck på webbplatsens ikon eller kalkylatorns namn öppnar dess startsida.

Länkar inom samma webbplats öppnas i appen; andra webblänkar öppnas i webbläsaren.
Telefonnummer och e-postlänkar öppnas i respektive app. Androids bakåtknapp eller bakåtgest stänger öppna menyer
och vyer eller går tillbaka i sidans historik.

Vissa element som ej lämpar sig för små skärmar göms - dock inget medicinskt innehåll, t.ex. rutan ”Viktig information om väntetider” på Giftinformationscentralens webbplats som annars tar upp halva skärmen.

## Sökning på sidan

Ett svep uppåt från verktygsfältet öppnar **Sök på sidan** för den aktuella webbsidan eller Belport.
Träffarna markeras löpande och pilarna **↑/↓** växlar mellan dem. Även hopfällda avsnitt genomsöks och öppnas vid träff.
Sökningen skiljer inte på stora och små bokstäver. Knappen `.*` aktiverar reguljära uttryck.

## Lediga vårdplatser

Sängikonen öppnar Belports översikt för **geriatrik i Stockholms län**, sorterad efter flest lediga platser.
Varje enhet visar lediga och disponibla platser, väntande remisser samt platstyper som **Vanliga** och **MRSA**
när flera typer finns. Telefonnummer öppnar telefonappen med numret ifyllt. Meddelanden och geografiskt ansvarsområde
finns i ett utfällbart avsnitt.

**Hämtad** anger appens senaste hämtning; **Uppdaterad** anger enhetens senaste uppdatering i Belport.
Uppdateringstider äldre än tolv timmar markeras med rött. Knappen **Uppdatera** eller ett drag nedåt från listans topp
hämtar uppgifterna på nytt. Listan uppdateras även när översikten öppnas om senaste hämtningen är äldre än två minuter.

## Inställningar

Inställningarna styr vilken webbplats som visas vid start, vilka webbplatser och kalkylatorer som syns,
deras startsidor och ordningen i verktygsfältet. **Spara** tillämpar ändringarna och **Återställ allt** återställer
standardinställningarna efter bekräftelse. **Extra CSS** gör det möjligt att anpassa webbplatsernas utseende.

Appens uppbyggnad och utveckling beskrivs i [ARCHITECTURE.md](ARCHITECTURE.md).

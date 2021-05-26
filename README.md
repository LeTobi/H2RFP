# Huber-Hugo Remote Function Protocol: H2RFP

## Idee
Das Ursprüngliche H2 Event Protokoll (H2EP) funktionierte mit Events, welche vom Server und Client gleichermassen erzeugt wurden und bei der Gegenseite ein Ereignis auslöste. Somit entstand ein sehr
unübersichtlicher Programmfluss mit grosser abhängigkeit zwischen Server und Client Implementierung.

Konkret soll mit H2RFP verhindert werden, dass der Programmfluss stark von der "Willkür" der Gegenseite
bestimmt wird. Nach Absenden eines Events bleibt die Programmposition bekannt. Das Ursprüngliche
Konzept von "einfachen" Events soll weiterhin erhalten werden.

## Anwendung

Die Anwendung von H2RFP wird anhand eines Browser-Chat-Programms mit JavaScript dargestellt:

### Initialisierung
Eine H2RFP-Objekt wird erstellt und verbindet mit Server. Der Verbindungsaufbau verwerndet ```Promise```
```JavaScript

var socket = new H2RFP_Socket("ws://localhost",15432);

async function main() {
    ...
    try {
        await socket.open();
    }
    catch (e) {
        println("verbindung fehlgeschlagen");
        return;
    }
    ...
}
```

### Kommunikation
Die Kommunikation geschieht auf 3 verschiedene Arten:

**listen:** Stellt einen Einstiegspunkt im Client-Programm dar. Ein Prozess wird auf Initiative des Servers gestartet. Optional kann auch auf die Anfrage geantwortet werden, wenn der Server dies erwartet.

```JavaScript

// data: JSON daten vom server
function receive(data)
{
    ...
}

// data: JSON daten vom server
// respond: Antwortet dem server
function pong(data, respond)
{
    ...
    respond( /* [daten] */);
}

async function main() {
    ...
    server.listen("message",receive);
    server.listen("ping",pong)
    ...
}
```

**notify:** Startet einen Prozess beim Server, ohne Einfluss auf Programmfluss im Client
```JavaScript
async function takeinput() {
    ...
    server.notify("message",{text:"hallo ihr"});
    ...
}
```

**exec**: Ein Teil des Programmflusses wird auf dem Server ausgeführt. Das Prinzip von ```Promise``` wird verwendet, um einzelne Funktionen auf dem Server auszuführen.
```JavaScript
async function takeinput()
{
    ...
    msg = await socket.exec("login",{name:val});
    ...
}
```
### Beenden
Eine Verbindung kann ohne Promise beendet werden.
```JavaScript
function takeinput(){
    ...
    if (val=="exit")
    {
        await socket.close();
        println("Du hast den Server verlassen");
    }
    ...
}
```

### Lokale Ereignisse
Damit ein Verbindungsverlust erkannt werden kann, gibt es lokale Ereignisse. 

```onDisconnect```: Dieses Ereigniss wird bei einem Verbindungsverlust ausgelöst.

```onConnect```: Dieses Ereigniss wird beim erneuten Verbinden ausgelöst.

```JavaScript
function main()
{
    ...
    socket.onDisconnect = ()=>{
        println("Verbindung verloren");
    };
    ...
}
```

## Übertragung
Die Kommunikation besteht aus Paketen, welche zwischen Server und Client ausgetauscht werden:
```
"!" + Funktion + ";" + ID + ";" + datenlänge + ";" + JSON
```
**Funktion**: Definiert die Art der Anforderung an die Gegenseite. Im Falle einer Antwort muss dieses Feld leer bleiben.  
**ID**: Identifiziert das Paket, um Prozess später fortzuführen (Siehe ```exec``` bei Anwendung). 0 falls irrelevant.  
**datenlänge**: Länge des folgenden JSON-Strings  
**JSON**: JSON-Notation der übertragenen Daten

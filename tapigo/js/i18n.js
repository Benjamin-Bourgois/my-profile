/* ==========================================================================
   Tapigo — Carte multilingue (pages client)
   - Textes fixes de la page client : dictionnaire ci-dessous (clé = texte
     français, {x} = valeur insérée).
   - Contenu de la carte (plats, descriptions, catégories, options) : traduit
     par l'IA à la demande du gérant et rangé dans menu.i18n[langue]. Un plat
     modifié depuis sa traduction s'affiche en français jusqu'à la suivante.
   Les commandes partent toujours en français vers la cuisine.
   ========================================================================== */
(function () {
  'use strict';

  var LANGS = [
    { id: 'fr', label: 'Français', flag: '🇫🇷' },
    { id: 'en', label: 'English', flag: '🇬🇧' },
    { id: 'es', label: 'Español', flag: '🇪🇸' },
    { id: 'de', label: 'Deutsch', flag: '🇩🇪' },
    { id: 'it', label: 'Italiano', flag: '🇮🇹' }
  ];
  var KEY = 'tapigo.v1.lang';

  // [français, anglais, espagnol, allemand, italien]
  var ROWS = [
    // En-tête, table, service
    ['Table', 'Table', 'Mesa', 'Tisch', 'Tavolo'],
    ['Table {t}', 'Table {t}', 'Mesa {t}', 'Tisch {t}', 'Tavolo {t}'],
    ['Table {t}, modifier', 'Table {t}, change', 'Mesa {t}, cambiar', 'Tisch {t}, ändern', 'Tavolo {t}, cambia'],
    ['Indiquer votre numéro de table', 'Enter your table number', 'Indique su número de mesa', 'Tischnummer angeben', 'Indica il numero del tavolo'],
    ['Commandes en ligne en pause.', 'Online ordering is paused.', 'Pedidos en línea en pausa.', 'Online-Bestellungen pausiert.', 'Ordini online in pausa.'],
    ['Le restaurant est très sollicité : adressez-vous au serveur ou réessayez dans quelques minutes.', 'The restaurant is very busy: please ask a waiter or try again in a few minutes.', 'El restaurante está muy concurrido: diríjase al camarero o inténtelo de nuevo en unos minutos.', 'Das Restaurant ist sehr ausgelastet: Bitte wenden Sie sich an das Personal oder versuchen Sie es in ein paar Minuten erneut.', 'Il ristorante è molto affollato: rivolgetevi al cameriere o riprovate tra qualche minuto.'],
    ['Bienvenue !', 'Welcome!', '¡Bienvenido!', 'Willkommen!', 'Benvenuti!'],
    ['Vous êtes à la <strong>table {t}</strong>{s}. Composez votre commande : elle part directement en cuisine.', 'You are at <strong>table {t}</strong>{s}. Build your order: it goes straight to the kitchen.', 'Está en la <strong>mesa {t}</strong>{s}. Haga su pedido: llega directamente a la cocina.', 'Sie sitzen an <strong>Tisch {t}</strong>{s}. Stellen Sie Ihre Bestellung zusammen: Sie geht direkt in die Küche.', 'Siete al <strong>tavolo {t}</strong>{s}. Componete l’ordine: arriva direttamente in cucina.'],
    [', servie par <strong>{s}</strong>', ', served by <strong>{s}</strong>', ', atendida por <strong>{s}</strong>', ', bedient von <strong>{s}</strong>', ', servito da <strong>{s}</strong>'],
    ['Changer de table', 'Change table', 'Cambiar de mesa', 'Tisch wechseln', 'Cambia tavolo'],
    ['Indiquez votre numéro de table pour pouvoir commander.', 'Enter your table number to order.', 'Indique su número de mesa para poder pedir.', 'Geben Sie Ihre Tischnummer an, um zu bestellen.', 'Indicate il numero del tavolo per ordinare.'],
    ['Indiquer ma table', 'Enter my table', 'Indicar mi mesa', 'Meinen Tisch angeben', 'Indica il mio tavolo'],
    ['Indiquez votre numéro de table', 'Enter your table number', 'Indique su número de mesa', 'Geben Sie Ihre Tischnummer an', 'Indicate il numero del tavolo'],
    ['La table {t} n’existe pas ici (tables 1 à {n})', 'Table {t} does not exist here (tables 1 to {n})', 'La mesa {t} no existe aquí (mesas 1 a {n})', 'Tisch {t} gibt es hier nicht (Tische 1 bis {n})', 'Il tavolo {t} non esiste qui (tavoli da 1 a {n})'],
    ['Service', 'Service', 'Servicio', 'Service', 'Servizio'],
    ['Appeler un serveur ou demander l’addition', 'Call a waiter or ask for the bill', 'Llamar a un camarero o pedir la cuenta', 'Bedienung rufen oder die Rechnung verlangen', 'Chiama un cameriere o chiedi il conto'],
    ['Besoin de quelque chose ?', 'Need anything?', '¿Necesita algo?', 'Brauchen Sie etwas?', 'Avete bisogno di qualcosa?'],
    ['Appeler un serveur', 'Call a waiter', 'Llamar a un camarero', 'Bedienung rufen', 'Chiama un cameriere'],
    ['Une question, une demande', 'A question, a request', 'Una pregunta, una petición', 'Eine Frage, ein Wunsch', 'Una domanda, una richiesta'],
    ['Demander l’addition', 'Ask for the bill', 'Pedir la cuenta', 'Rechnung verlangen', 'Chiedi il conto'],
    ['Un serveur vient encaisser', 'A waiter will come to take payment', 'Un camarero vendrá a cobrar', 'Die Bedienung kommt zum Kassieren', 'Un cameriere viene a incassare'],
    ['Envoi…', 'Sending…', 'Enviando…', 'Wird gesendet…', 'Invio…'],
    ['Demande envoyée.', 'Request sent.', 'Petición enviada.', 'Anfrage gesendet.', 'Richiesta inviata.'],
    ['Un serveur arrive avec l’addition.', 'A waiter is coming with the bill.', 'Un camarero llega con la cuenta.', 'Die Bedienung kommt mit der Rechnung.', 'Un cameriere arriva con il conto.'],
    ['Un serveur arrive à la table {t}.', 'A waiter is coming to table {t}.', 'Un camarero llega a la mesa {t}.', 'Die Bedienung kommt an Tisch {t}.', 'Un cameriere arriva al tavolo {t}.'],
    ['Numéro de table', 'Table number', 'Número de mesa', 'Tischnummer', 'Numero del tavolo'],
    ['Quelle est votre table ?', 'Which is your table?', '¿Cuál es su mesa?', 'Welcher ist Ihr Tisch?', 'Qual è il vostro tavolo?'],
    ['Le numéro est indiqué sur votre table.', 'The number is shown on your table.', 'El número está indicado en su mesa.', 'Die Nummer steht auf Ihrem Tisch.', 'Il numero è indicato sul tavolo.'],
    ['N°', 'No.', 'N.º', 'Nr.', 'N.'],
    ['Valider', 'Confirm', 'Confirmar', 'Bestätigen', 'Conferma'],
    ['Voir la carte et commander', 'See the menu and order', 'Ver la carta y pedir', 'Karte ansehen und bestellen', 'Vedi il menù e ordina'],
    ['Table <strong>{t}</strong> enregistrée', 'Table <strong>{t}</strong> saved', 'Mesa <strong>{t}</strong> registrada', 'Tisch <strong>{t}</strong> gespeichert', 'Tavolo <strong>{t}</strong> registrato'],
    ['Langue', 'Language', 'Idioma', 'Sprache', 'Lingua'],
    // Recherche et filtres
    ['Rechercher un plat, un ingrédient…', 'Search a dish, an ingredient…', 'Buscar un plato, un ingrediente…', 'Gericht oder Zutat suchen…', 'Cerca un piatto, un ingrediente…'],
    ['Rechercher dans le menu', 'Search the menu', 'Buscar en la carta', 'In der Karte suchen', 'Cerca nel menù'],
    ['Effacer la recherche', 'Clear search', 'Borrar la búsqueda', 'Suche löschen', 'Cancella la ricerca'],
    ['Catégories', 'Categories', 'Categorías', 'Kategorien', 'Categorie'],
    ['Filtres rapides', 'Quick filters', 'Filtros rápidos', 'Schnellfilter', 'Filtri rapidi'],
    ['Chargement de la carte…', 'Loading the menu…', 'Cargando la carta…', 'Karte wird geladen…', 'Caricamento del menù…'],
    ['Tout', 'All', 'Todo', 'Alle', 'Tutto'],
    ['{n} choix', '{n} items', '{n} opciones', '{n} Gerichte', '{n} scelte'],
    ['La carte arrive bientôt', 'The menu is coming soon', 'La carta llega pronto', 'Die Karte kommt bald', 'Il menù arriva presto'],
    ['Le restaurant prépare son menu. Revenez dans quelques instants.', 'The restaurant is preparing its menu. Come back in a moment.', 'El restaurante está preparando su carta. Vuelva en unos instantes.', 'Das Restaurant bereitet seine Karte vor. Schauen Sie gleich wieder vorbei.', 'Il ristorante sta preparando il menù. Tornate tra qualche istante.'],
    ['Aucun résultat', 'No results', 'Ningún resultado', 'Keine Ergebnisse', 'Nessun risultato'],
    ['Essayez un autre mot-clé ou retirez un filtre.', 'Try another keyword or remove a filter.', 'Pruebe otra palabra o quite un filtro.', 'Versuchen Sie ein anderes Wort oder entfernen Sie einen Filter.', 'Provate un’altra parola o togliete un filtro.'],
    ['Réinitialiser les filtres', 'Reset filters', 'Restablecer filtros', 'Filter zurücksetzen', 'Azzera i filtri'],
    // Plats
    ['Signature', 'Signature', 'Especialidad', 'Spezialität', 'Specialità'],
    ['Végétarien', 'Vegetarian', 'Vegetariano', 'Vegetarisch', 'Vegetariano'],
    ['Sans gluten', 'Gluten-free', 'Sin gluten', 'Glutenfrei', 'Senza glutine'],
    ['Entrées', 'Starters', 'Entrantes', 'Vorspeisen', 'Antipasti'],
    ['Plats', 'Mains', 'Platos', 'Hauptgerichte', 'Piatti'],
    ['Desserts', 'Desserts', 'Postres', 'Desserts', 'Dolci'],
    ['Boissons', 'Drinks', 'Bebidas', 'Getränke', 'Bevande'],
    ['Plus que {n}', 'Only {n} left', 'Solo quedan {n}', 'Nur noch {n}', 'Solo {n} rimasti'],
    ['Personnalisable', 'Customisable', 'Personalizable', 'Anpassbar', 'Personalizzabile'],
    ['Ajouter {name}', 'Add {name}', 'Añadir {name}', '{name} hinzufügen', 'Aggiungi {name}'],
    ['−{p} % aujourd’hui', '−{p}% today', '−{p} % hoy', '−{p} % heute', '−{p}% oggi'],
    ['Suggestion du chef', 'Chef’s suggestion', 'Sugerencia del chef', 'Empfehlung des Küchenchefs', 'Suggerimento dello chef'],
    ['À ne pas manquer aujourd’hui', 'Not to be missed today', 'No se lo pierda hoy', 'Heute nicht verpassen', 'Da non perdere oggi'],
    ['anti-gaspi', 'zero waste', 'antidesperdicio', 'gegen Verschwendung', 'antispreco'],
    ['Des produits frais à écouler aujourd’hui : moins de gaspillage, et un petit prix pour vous.', 'Fresh produce to enjoy today: less waste, and a lower price for you.', 'Productos frescos para hoy: menos desperdicio y un precio menor para usted.', 'Frische Produkte für heute: weniger Verschwendung und ein kleinerer Preis für Sie.', 'Prodotti freschi da gustare oggi: meno spreco e un prezzo più basso per voi.'],
    ['Contient de l’alcool', 'Contains alcohol', 'Contiene alcohol', 'Enthält Alkohol', 'Contiene alcol'],
    ['Allergènes', 'Allergens', 'Alérgenos', 'Allergene', 'Allergeni'],
    ['Allergènes : {a}', 'Allergens: {a}', 'Alérgenos: {a}', 'Allergene: {a}', 'Allergeni: {a}'],
    ['Parfait avec', 'Goes well with', 'Perfecto con', 'Passt gut zu', 'Perfetto con'],
    ['Ce plat n’est plus disponible', 'This dish is no longer available', 'Este plato ya no está disponible', 'Dieses Gericht ist nicht mehr verfügbar', 'Questo piatto non è più disponibile'],
    ['Obligatoire', 'Required', 'Obligatorio', 'Pflichtauswahl', 'Obbligatorio'],
    ['Facultatif · plusieurs choix', 'Optional · several choices', 'Opcional · varias opciones', 'Optional · mehrere möglich', 'Facoltativo · più scelte'],
    ['Facultatif', 'Optional', 'Opcional', 'Optional', 'Facoltativo'],
    ['Plus que {n} disponible', 'Only {n} available', 'Solo queda {n}', 'Nur noch {n} verfügbar', 'Solo {n} disponibile'],
    ['Plus que {n} disponibles', 'Only {n} available', 'Solo quedan {n}', 'Nur noch {n} verfügbar', 'Solo {n} disponibili'],
    ['Note pour la cuisine', 'Note for the kitchen', 'Nota para la cocina', 'Hinweis für die Küche', 'Nota per la cucina'],
    ['Ex : sans oignon, sauce à part, allergie…', 'E.g. no onion, sauce on the side, allergy…', 'Ej.: sin cebolla, salsa aparte, alergia…', 'Z. B. ohne Zwiebeln, Soße extra, Allergie…', 'Es.: senza cipolla, salsa a parte, allergia…'],
    ['Quantité', 'Quantity', 'Cantidad', 'Menge', 'Quantità'],
    ['Retirer un', 'Remove one', 'Quitar uno', 'Eins weniger', 'Togli uno'],
    ['Ajouter un', 'Add one', 'Añadir uno', 'Eins mehr', 'Aggiungi uno'],
    ['Ajouter · {p}', 'Add · {p}', 'Añadir · {p}', 'Hinzufügen · {p}', 'Aggiungi · {p}'],
    ['<strong>{name}</strong> ajouté au panier', '<strong>{name}</strong> added to your basket', '<strong>{name}</strong> añadido a la cesta', '<strong>{name}</strong> in den Warenkorb gelegt', '<strong>{name}</strong> aggiunto al carrello'],
    ['<strong>{q} × {name}</strong> ajouté au panier', '<strong>{q} × {name}</strong> added to your basket', '<strong>{q} × {name}</strong> añadido a la cesta', '<strong>{q} × {name}</strong> in den Warenkorb gelegt', '<strong>{q} × {name}</strong> aggiunto al carrello'],
    // Panier
    ['Plus aucun disponible pour le moment', 'None left for now', 'No queda ninguno por ahora', 'Im Moment keins mehr verfügbar', 'Al momento non ce ne sono più'],
    ['Voir le panier', 'View basket', 'Ver la cesta', 'Warenkorb ansehen', 'Vedi il carrello'],
    ['Votre panier est vide', 'Your basket is empty', 'Su cesta está vacía', 'Ihr Warenkorb ist leer', 'Il carrello è vuoto'],
    ['Parcourez la carte et laissez-vous tenter.', 'Browse the menu and treat yourself.', 'Recorra la carta y déjese tentar.', 'Stöbern Sie in der Karte und lassen Sie sich verführen.', 'Sfogliate il menù e lasciatevi tentare.'],
    ['Produit retiré', 'Item removed', 'Producto retirado', 'Artikel entfernt', 'Prodotto rimosso'],
    ['Plus disponible', 'No longer available', 'Ya no disponible', 'Nicht mehr verfügbar', 'Non più disponibile'],
    ['Retirer', 'Remove', 'Quitar', 'Entfernen', 'Rimuovi'],
    ['Modifier la note', 'Edit note', 'Modificar la nota', 'Hinweis ändern', 'Modifica la nota'],
    ['Ajouter une note', 'Add a note', 'Añadir una nota', 'Hinweis hinzufügen', 'Aggiungi una nota'],
    ['Ex : sans oignon', 'E.g. no onion', 'Ej.: sin cebolla', 'Z. B. ohne Zwiebeln', 'Es.: senza cipolla'],
    ['Un message pour toute la commande ?', 'A message for the whole order?', '¿Un mensaje para todo el pedido?', 'Eine Nachricht zur ganzen Bestellung?', 'Un messaggio per tutto l’ordine?'],
    ['Ex : servir les entrées ensemble, une chaise bébé…', 'E.g. serve the starters together, a high chair…', 'Ej.: servir los entrantes juntos, una trona…', 'Z. B. Vorspeisen zusammen servieren, ein Kinderstuhl…', 'Es.: servire gli antipasti insieme, un seggiolone…'],
    ['{n} article', '{n} item', '{n} artículo', '{n} Artikel', '{n} articolo'],
    ['{n} articles', '{n} items', '{n} artículos', '{n} Artikel', '{n} articoli'],
    ['Inclus', 'Included', 'Incluido', 'Inklusive', 'Incluso'],
    ['Total TTC', 'Total incl. VAT', 'Total IVA incl.', 'Gesamt inkl. MwSt.', 'Totale IVA inclusa'],
    ['Panier', 'Basket', 'Cesta', 'Warenkorb', 'Carrello'],
    ['Votre commande', 'Your order', 'Su pedido', 'Ihre Bestellung', 'Il vostro ordine'],
    ['Votre panier', 'Your basket', 'Su cesta', 'Ihr Warenkorb', 'Il vostro carrello'],
    ['Commandes en pause', 'Ordering paused', 'Pedidos en pausa', 'Bestellungen pausiert', 'Ordini in pausa'],
    ['Commander · {p}', 'Order · {p}', 'Pedir · {p}', 'Bestellen · {p}', 'Ordina · {p}'],
    ['Panier vide', 'Basket empty', 'Cesta vacía', 'Warenkorb leer', 'Carrello vuoto'],
    // Paiement
    ['Espèces', 'Cash', 'Efectivo', 'Bargeld', 'Contanti'],
    ['Carte bancaire', 'Bank card', 'Tarjeta bancaria', 'Bankkarte', 'Carta bancaria'],
    ['Espèces et carte', 'Cash and card', 'Efectivo y tarjeta', 'Bargeld und Karte', 'Contanti e carta'],
    ['Règlement en <strong>espèces</strong> uniquement.', 'Payment in <strong>cash</strong> only.', 'Pago solo en <strong>efectivo</strong>.', 'Zahlung nur in <strong>bar</strong>.', 'Pagamento solo in <strong>contanti</strong>.'],
    ['Règlement par <strong>carte bancaire</strong> uniquement.', 'Payment by <strong>card</strong> only.', 'Pago solo con <strong>tarjeta</strong>.', 'Zahlung nur mit <strong>Karte</strong>.', 'Pagamento solo con <strong>carta</strong>.'],
    ['Comment réglerez-vous ?', 'How will you pay?', '¿Cómo pagará?', 'Wie zahlen Sie?', 'Come pagherete?'],
    ['en liquide', 'notes and coins', 'en metálico', 'in bar', 'in contanti'],
    ['Carte', 'Card', 'Tarjeta', 'Karte', 'Carta'],
    ['sans contact', 'contactless', 'sin contacto', 'kontaktlos', 'contactless'],
    ['Les deux', 'Both', 'Ambos', 'Beides', 'Entrambi'],
    ['espèces + carte', 'cash + card', 'efectivo + tarjeta', 'bar + Karte', 'contanti + carta'],
    ['Le serveur viendra avec le terminal ou la monnaie.', 'The waiter will bring the card machine or change.', 'El camarero vendrá con el terminal o el cambio.', 'Die Bedienung bringt das Kartenterminal oder Wechselgeld.', 'Il cameriere porterà il terminale o il resto.'],
    ['Un pourboire pour {s} et l’équipe ?', 'A tip for {s} and the team?', '¿Una propina para {s} y el equipo?', 'Ein Trinkgeld für {s} und das Team?', 'Una mancia per {s} e la squadra?'],
    ['Un pourboire pour l’équipe ?', 'A tip for the team?', '¿Una propina para el equipo?', 'Ein Trinkgeld für das Team?', 'Una mancia per la squadra?'],
    ['Non merci', 'No thanks', 'No, gracias', 'Nein danke', 'No grazie'],
    ['Autre', 'Other', 'Otro', 'Anderer', 'Altro'],
    ['montant', 'amount', 'importe', 'Betrag', 'importo'],
    ['Montant du pourboire', 'Tip amount', 'Importe de la propina', 'Trinkgeldbetrag', 'Importo della mancia'],
    ['Reversé intégralement au restaurant.', 'Paid in full to the restaurant.', 'Entregada íntegramente al restaurante.', 'Geht vollständig an das Restaurant.', 'Versata interamente al ristorante.'],
    ['Paiement', 'Payment', 'Pago', 'Zahlung', 'Pagamento'],
    ['Étape finale', 'Last step', 'Último paso', 'Letzter Schritt', 'Ultimo passo'],
    ['Valider la commande', 'Confirm the order', 'Confirmar el pedido', 'Bestellung bestätigen', 'Conferma l’ordine'],
    ['Payer &amp; commander', 'Pay &amp; order', 'Pagar y pedir', 'Bezahlen &amp; bestellen', 'Paga e ordina'],
    ['Numéro de votre table', 'Your table number', 'Número de su mesa', 'Ihre Tischnummer', 'Numero del vostro tavolo'],
    ['Ex : 12', 'E.g. 12', 'Ej.: 12', 'Z. B. 12', 'Es.: 12'],
    ['Indiqué sur le chevalet NFC posé sur votre table.', 'Shown on the NFC stand on your table.', 'Indicado en el soporte NFC de su mesa.', 'Steht auf dem NFC-Aufsteller auf Ihrem Tisch.', 'Indicato sul segnatavolo NFC.'],
    ['Moyen de paiement', 'Payment method', 'Forma de pago', 'Zahlungsart', 'Metodo di pagamento'],
    ['Payer maintenant', 'Pay now', 'Pagar ahora', 'Jetzt bezahlen', 'Paga ora'],
    ['Carte, {w} · paiement sécurisé', 'Card, {w} · secure payment', 'Tarjeta, {w} · pago seguro', 'Karte, {w} · sichere Zahlung', 'Carta, {w} · pagamento sicuro'],
    ['Paiement express en un geste', 'One-tap express payment', 'Pago exprés en un gesto', 'Expresszahlung mit einem Tipp', 'Pagamento rapido in un gesto'],
    ['Visa, Mastercard, Amex · via Stripe', 'Visa, Mastercard, Amex · via Stripe', 'Visa, Mastercard, Amex · con Stripe', 'Visa, Mastercard, Amex · über Stripe', 'Visa, Mastercard, Amex · con Stripe'],
    ['Payer à table', 'Pay at the table', 'Pagar en la mesa', 'Am Tisch bezahlen', 'Paga al tavolo'],
    ['Payer sur place', 'Pay on site', 'Pagar en el local', 'Vor Ort bezahlen', 'Paga sul posto'],
    ['Le serveur passe avec le terminal en fin de repas', 'The waiter brings the card machine at the end of the meal', 'El camarero pasa con el terminal al final de la comida', 'Die Bedienung kommt am Ende mit dem Kartenterminal', 'Il cameriere passa con il terminale a fine pasto'],
    ['Numéro de carte', 'Card number', 'Número de tarjeta', 'Kartennummer', 'Numero di carta'],
    ['Expiration', 'Expiry', 'Caducidad', 'Ablaufdatum', 'Scadenza'],
    ['MM/AA', 'MM/YY', 'MM/AA', 'MM/JJ', 'MM/AA'],
    ['Mode démo : utilisez 4242 4242 4242 4242, n’importe quelle date future et un CVC.', 'Demo mode: use 4242 4242 4242 4242, any future date and any CVC.', 'Modo demo: use 4242 4242 4242 4242, cualquier fecha futura y un CVC.', 'Demomodus: 4242 4242 4242 4242, ein beliebiges künftiges Datum und eine CVC verwenden.', 'Modalità demo: usate 4242 4242 4242 4242, una data futura qualsiasi e un CVC.'],
    ['Vous réglerez directement à table, en fin de repas.', 'You will pay at the table at the end of the meal.', 'Pagará directamente en la mesa, al final de la comida.', 'Sie zahlen am Ende direkt am Tisch.', 'Pagherete direttamente al tavolo, a fine pasto.'],
    ['Paiement sécurisé par Stripe · Données chiffrées', 'Secure payment by Stripe · Encrypted data', 'Pago seguro con Stripe · Datos cifrados', 'Sichere Zahlung über Stripe · Verschlüsselte Daten', 'Pagamento sicuro con Stripe · Dati criptati'],
    ['Paiement sécurisé par Stripe, encaissé directement par {r}. Votre commande part en cuisine dès le paiement validé.', 'Secure payment by Stripe, received directly by {r}. Your order goes to the kitchen as soon as payment is confirmed.', 'Pago seguro con Stripe, cobrado directamente por {r}. Su pedido llega a la cocina en cuanto se confirma el pago.', 'Sichere Zahlung über Stripe, direkt an {r}. Ihre Bestellung geht in die Küche, sobald die Zahlung bestätigt ist.', 'Pagamento sicuro con Stripe, incassato direttamente da {r}. L’ordine va in cucina appena il pagamento è confermato.'],
    ['Payer · {p}', 'Pay · {p}', 'Pagar · {p}', 'Bezahlen · {p}', 'Paga · {p}'],
    ['Payer et commander · {p}', 'Pay and order · {p}', 'Pagar y pedir · {p}', 'Bezahlen und bestellen · {p}', 'Paga e ordina · {p}'],
    ['Les commandes en ligne sont en pause. Adressez-vous au serveur.', 'Online ordering is paused. Please ask a waiter.', 'Los pedidos en línea están en pausa. Diríjase al camarero.', 'Online-Bestellungen sind pausiert. Bitte wenden Sie sich an das Personal.', 'Gli ordini online sono in pausa. Rivolgetevi al cameriere.'],
    ['Indiquez comment vous réglerez : espèces, carte ou les deux.', 'Tell us how you will pay: cash, card or both.', 'Indique cómo pagará: efectivo, tarjeta o ambos.', 'Geben Sie an, wie Sie zahlen: bar, Karte oder beides.', 'Indicate come pagherete: contanti, carta o entrambi.'],
    ['Numéro de carte invalide', 'Invalid card number', 'Número de tarjeta no válido', 'Ungültige Kartennummer', 'Numero di carta non valido'],
    ['Date d’expiration invalide', 'Invalid expiry date', 'Fecha de caducidad no válida', 'Ungültiges Ablaufdatum', 'Data di scadenza non valida'],
    ['CVC invalide', 'Invalid CVC', 'CVC no válido', 'Ungültige CVC', 'CVC non valido'],
    ['Envoi en cuisine…', 'Sending to the kitchen…', 'Enviando a la cocina…', 'Wird an die Küche gesendet…', 'Invio in cucina…'],
    ['Ouverture du paiement…', 'Opening payment…', 'Abriendo el pago…', 'Zahlung wird geöffnet…', 'Apertura del pagamento…'],
    ['Paiement sécurisé en cours…', 'Secure payment in progress…', 'Pago seguro en curso…', 'Sichere Zahlung läuft…', 'Pagamento sicuro in corso…'],
    ['La commande n’a pas pu être envoyée. Réessayez.', 'The order could not be sent. Please try again.', 'No se pudo enviar el pedido. Inténtelo de nuevo.', 'Die Bestellung konnte nicht gesendet werden. Bitte erneut versuchen.', 'Non è stato possibile inviare l’ordine. Riprovate.'],
    ['Le paiement n’a pas pu s’ouvrir. Réessayez ou choisissez « Payer à table ».', 'Payment could not open. Try again or choose “Pay at the table”.', 'No se pudo abrir el pago. Inténtelo de nuevo o elija «Pagar en la mesa».', 'Die Zahlung konnte nicht geöffnet werden. Erneut versuchen oder „Am Tisch bezahlen“ wählen.', 'Non è stato possibile aprire il pagamento. Riprovate o scegliete «Paga al tavolo».'],
    ['Le paiement n’a pas pu s’ouvrir. Réessayez.', 'Payment could not open. Please try again.', 'No se pudo abrir el pago. Inténtelo de nuevo.', 'Die Zahlung konnte nicht geöffnet werden. Bitte erneut versuchen.', 'Non è stato possibile aprire il pagamento. Riprovate.'],
    ['Paiement annulé · votre panier est conservé', 'Payment cancelled · your basket is kept', 'Pago cancelado · se conserva su cesta', 'Zahlung abgebrochen · Ihr Warenkorb bleibt erhalten', 'Pagamento annullato · il carrello è conservato'],
    ['Paiement non abouti : la commande a été annulée. Votre carte n’a pas été débitée.', 'Payment not completed: the order was cancelled. Your card was not charged.', 'Pago no completado: el pedido se ha cancelado. No se ha cargado su tarjeta.', 'Zahlung nicht abgeschlossen: Die Bestellung wurde storniert. Ihre Karte wurde nicht belastet.', 'Pagamento non riuscito: l’ordine è stato annullato. La carta non è stata addebitata.'],
    // Suivi de commande
    ['Commande envoyée en cuisine', 'Order sent to the kitchen', 'Pedido enviado a la cocina', 'Bestellung an die Küche gesendet', 'Ordine inviato in cucina'],
    ['En préparation', 'Being prepared', 'En preparación', 'In Zubereitung', 'In preparazione'],
    ['Prête', 'Ready', 'Listo', 'Fertig', 'Pronto'],
    ['Servie', 'Served', 'Servido', 'Serviert', 'Servito'],
    ['Nouvelle', 'New', 'Nuevo', 'Neu', 'Nuovo'],
    ['Terminée', 'Completed', 'Terminado', 'Abgeschlossen', 'Concluso'],
    ['Prête à être servie', 'Ready to be served', 'Listo para servir', 'Bereit zum Servieren', 'Pronto da servire'],
    ['Le chef a bien reçu votre commande.', 'The chef has received your order.', 'El chef ha recibido su pedido.', 'Der Küchenchef hat Ihre Bestellung erhalten.', 'Lo chef ha ricevuto il vostro ordine.'],
    ['Vos plats sont en cours de préparation.', 'Your dishes are being prepared.', 'Sus platos se están preparando.', 'Ihre Gerichte werden zubereitet.', 'I vostri piatti sono in preparazione.'],
    ['Votre commande arrive à votre table.', 'Your order is on its way to your table.', 'Su pedido llega a su mesa.', 'Ihre Bestellung kommt an Ihren Tisch.', 'Il vostro ordine sta arrivando al tavolo.'],
    ['Bon appétit !', 'Enjoy your meal!', '¡Buen provecho!', 'Guten Appetit!', 'Buon appetito!'],
    ['Merci de votre visite, à très bientôt.', 'Thank you for your visit, see you soon.', 'Gracias por su visita, hasta pronto.', 'Danke für Ihren Besuch, bis bald.', 'Grazie della visita, a presto.'],
    ['Sur place', 'On site', 'En el local', 'Vor Ort', 'Sul posto'],
    ['en ligne', 'online', 'en línea', 'online', 'online'],
    ['Paiement en cours de validation', 'Payment being confirmed', 'Pago en curso de validación', 'Zahlung wird bestätigt', 'Pagamento in corso di conferma'],
    ['Votre commande part en cuisine dès que le paiement est confirmé (quelques secondes).', 'Your order goes to the kitchen as soon as payment is confirmed (a few seconds).', 'Su pedido llega a la cocina en cuanto se confirma el pago (unos segundos).', 'Ihre Bestellung geht in die Küche, sobald die Zahlung bestätigt ist (wenige Sekunden).', 'L’ordine va in cucina appena il pagamento è confermato (qualche secondo).'],
    ['Retour au menu', 'Back to the menu', 'Volver a la carta', 'Zurück zur Karte', 'Torna al menù'],
    ['Commande n° {n} · {h}', 'Order no. {n} · {h}', 'Pedido n.º {n} · {h}', 'Bestellung Nr. {n} · {h}', 'Ordine n. {n} · {h}'],
    ['Vérifier le paiement', 'Check payment', 'Comprobar el pago', 'Zahlung prüfen', 'Verifica il pagamento'],
    ['Votre serveur : <strong>{s}</strong>', 'Your waiter: <strong>{s}</strong>', 'Su camarero: <strong>{s}</strong>', 'Ihre Bedienung: <strong>{s}</strong>', 'Il vostro cameriere: <strong>{s}</strong>'],
    ['Note : « {n} »', 'Note: “{n}”', 'Nota: «{n}»', 'Hinweis: „{n}“', 'Nota: «{n}»'],
    ['Payé · {m}', 'Paid · {m}', 'Pagado · {m}', 'Bezahlt · {m}', 'Pagato · {m}'],
    ['carte', 'card', 'tarjeta', 'Karte', 'carta'],
    ['Paiement en cours…', 'Payment in progress…', 'Pago en curso…', 'Zahlung läuft…', 'Pagamento in corso…'],
    ['À régler sur place', 'To pay on site', 'A pagar en el local', 'Vor Ort zu zahlen', 'Da pagare sul posto'],
    ['Pourboire', 'Tip', 'Propina', 'Trinkgeld', 'Mancia'],
    ['Total', 'Total', 'Total', 'Gesamt', 'Totale'],
    ['Vous avez aimé ?', 'Did you enjoy it?', '¿Le ha gustado?', 'Hat es Ihnen geschmeckt?', 'Vi è piaciuto?'],
    ['Votre avis aide beaucoup {r}.', 'Your review really helps {r}.', 'Su opinión ayuda mucho a {r}.', 'Ihre Bewertung hilft {r} sehr.', 'La vostra recensione aiuta molto {r}.'],
    ['★ Laisser un avis Google', '★ Leave a Google review', '★ Dejar una reseña en Google', '★ Google-Bewertung abgeben', '★ Lascia una recensione Google'],
    ['Revenir au menu', 'Back to the menu', 'Volver a la carta', 'Zurück zur Karte', 'Torna al menù'],
    ['Cette page se met à jour automatiquement.', 'This page updates automatically.', 'Esta página se actualiza automáticamente.', 'Diese Seite aktualisiert sich automatisch.', 'Questa pagina si aggiorna automaticamente.'],
    ['Suivi de commande', 'Order tracking', 'Seguimiento del pedido', 'Bestellverfolgung', 'Stato dell’ordine'],
    ['Suivre ma commande', 'Track my order', 'Seguir mi pedido', 'Meine Bestellung verfolgen', 'Segui il mio ordine'],
    ['Laisser un avis', 'Leave a review', 'Dejar una reseña', 'Bewertung abgeben', 'Lascia una recensione'],
    ['Merci pour votre visite', 'Thank you for your visit', 'Gracias por su visita', 'Danke für Ihren Besuch', 'Grazie della visita'],
    ['Votre avis aide beaucoup <strong>{r}</strong>{s}. Cela ne prend que 30 secondes.', 'Your review really helps <strong>{r}</strong>{s}. It only takes 30 seconds.', 'Su opinión ayuda mucho a <strong>{r}</strong>{s}. Solo lleva 30 segundos.', 'Ihre Bewertung hilft <strong>{r}</strong>{s} sehr. Es dauert nur 30 Sekunden.', 'La vostra recensione aiuta molto <strong>{r}</strong>{s}. Bastano 30 secondi.'],
    [' et {s}', ' and {s}', ' y a {s}', ' und {s}', ' e {s}'],
    ['Ouverture de Google dans {n} s…', 'Opening Google in {n} s…', 'Abriendo Google en {n} s…', 'Google öffnet sich in {n} s…', 'Apertura di Google tra {n} s…'],
    ['Ouverture de Google…', 'Opening Google…', 'Abriendo Google…', 'Google wird geöffnet…', 'Apertura di Google…'],
    ['★ Donner mon avis', '★ Give my review', '★ Dar mi opinión', '★ Bewertung abgeben', '★ Lascia la mia recensione'],
    ['{n} commandes en cours', '{n} orders in progress', '{n} pedidos en curso', '{n} laufende Bestellungen', '{n} ordini in corso'],
    ['N° {n} · {s}', 'No. {n} · {s}', 'N.º {n} · {s}', 'Nr. {n} · {s}', 'N. {n} · {s}'],
    ['Mes commandes', 'My orders', 'Mis pedidos', 'Meine Bestellungen', 'I miei ordini'],
    ['Commande n° {n}', 'Order no. {n}', 'Pedido n.º {n}', 'Bestellung Nr. {n}', 'Ordine n. {n}'],
    ['Vérification…', 'Checking…', 'Comprobando…', 'Wird geprüft…', 'Verifica…'],
    ['<strong>Commande n° {n}</strong> · {s}', '<strong>Order no. {n}</strong> · {s}', '<strong>Pedido n.º {n}</strong> · {s}', '<strong>Bestellung Nr. {n}</strong> · {s}', '<strong>Ordine n. {n}</strong> · {s}'],
    ['Menu momentanément indisponible', 'Menu temporarily unavailable', 'Carta no disponible por el momento', 'Karte vorübergehend nicht verfügbar', 'Menù momentaneamente non disponibile'],
    ['Commande en ligne indisponible', 'Online ordering unavailable', 'Pedidos en línea no disponibles', 'Online-Bestellung nicht verfügbar', 'Ordini online non disponibili'],
    ['Lien à mettre à jour', 'Link needs updating', 'Enlace por actualizar', 'Link muss aktualisiert werden', 'Link da aggiornare'],
    ['Restaurant introuvable', 'Restaurant not found', 'Restaurante no encontrado', 'Restaurant nicht gefunden', 'Ristorante non trovato'],
    ['Réessayer', 'Try again', 'Reintentar', 'Erneut versuchen', 'Riprova'],
    // Allergènes réglementaires
    ['Gluten', 'Gluten', 'Gluten', 'Gluten', 'Glutine'],
    ['Crustacés', 'Crustaceans', 'Crustáceos', 'Krebstiere', 'Crostacei'],
    ['Œufs', 'Eggs', 'Huevos', 'Eier', 'Uova'],
    ['Poissons', 'Fish', 'Pescado', 'Fisch', 'Pesce'],
    ['Arachides', 'Peanuts', 'Cacahuetes', 'Erdnüsse', 'Arachidi'],
    ['Soja', 'Soy', 'Soja', 'Soja', 'Soia'],
    ['Lait', 'Milk', 'Leche', 'Milch', 'Latte'],
    ['Fruits à coque', 'Tree nuts', 'Frutos de cáscara', 'Schalenfrüchte', 'Frutta a guscio'],
    ['Céleri', 'Celery', 'Apio', 'Sellerie', 'Sedano'],
    ['Moutarde', 'Mustard', 'Mostaza', 'Senf', 'Senape'],
    ['Sésame', 'Sesame', 'Sésamo', 'Sesam', 'Sesamo'],
    ['Sulfites', 'Sulphites', 'Sulfitos', 'Sulfite', 'Solfiti'],
    ['Lupin', 'Lupin', 'Altramuces', 'Lupinen', 'Lupini'],
    ['Mollusques', 'Molluscs', 'Moluscos', 'Weichtiere', 'Molluschi']
  ];

  var DICT = {};
  ROWS.forEach(function (r) {
    ['en', 'es', 'de', 'it'].forEach(function (l, i) { (DICT[l] = DICT[l] || {})[r[0]] = r[i + 1]; });
  });

  function fill(s, vars) {
    return !vars ? s : s.replace(/\{(\w+)\}/g, function (m, k) { return k in vars ? vars[k] : m; });
  }

  var current = 'fr';

  // Langues proposées par le restaurant (réglage du gérant) ; le français toujours.
  function offered(info) {
    var list = (info && info.languages) || [];
    return LANGS.filter(function (l) { return l.id === 'fr' || list.indexOf(l.id) >= 0; });
  }

  // Langue au chargement : ?lang=, choix mémorisé, puis langue du téléphone.
  function detect(info) {
    var ok = offered(info).map(function (l) { return l.id; });
    var pick = function (v) { v = String(v || '').slice(0, 2).toLowerCase(); return ok.indexOf(v) >= 0 ? v : null; };
    var q = null, saved = null;
    try { q = new URLSearchParams(location.search).get('lang'); saved = localStorage.getItem(KEY); } catch (e) { /* ignore */ }
    var nav = (navigator.languages || [navigator.language || '']).map(pick).filter(Boolean)[0];
    current = pick(q) || pick(saved) || nav || 'fr';
    document.documentElement.lang = current;
    return current;
  }

  function set(lang) {
    current = lang;
    document.documentElement.lang = lang;
    try { localStorage.setItem(KEY, lang); } catch (e) { /* ignore */ }
  }

  function t(fr, vars) {
    var tr = current !== 'fr' && DICT[current] && DICT[current][fr];
    return fill(tr || fr, vars);
  }

  /* ---------------- Contenu de la carte ---------------- */
  var menu = null;
  function useMenu(m) { menu = m; }
  function pack() { return current !== 'fr' && menu && menu.i18n && menu.i18n[current]; }
  function srcOf(item) { return (item.name || '') + '\n' + (item.description || ''); }

  function itemTr(item) {
    var p = pack(), tr = p && p.items && p.items[item.id];
    return tr && tr.src === srcOf(item) ? tr : null;
  }
  function name(item) { var tr = itemTr(item); return tr && tr.name ? tr.name : item.name; }
  function desc(item) { var tr = itemTr(item); return tr ? tr.description || '' : item.description || ''; }
  // Textes rangés par leur version française : catégories, groupes et choix d'options, étiquettes.
  function word(kind, fr) {
    var p = pack(), v = p && p[kind] && p[kind][fr];
    return v || t(fr);
  }
  function cat(c) { return word('cats', c.label); }
  function group(fr) { return word('groups', fr); }
  function choice(fr) { return word('choices', fr); }
  function tag(fr) { return word('tags', fr); }
  function tagline(fr) { var p = pack(); return p && p.tagline && p.tagline.src === fr ? p.tagline.text : fr; }
  // Ligne de commande (enregistrée en français) : nom traduit d'après le produit de la carte.
  function lineName(l) {
    var item = l.itemId && menu && (menu.items || []).filter(function (i) { return i.id === l.itemId; })[0];
    return item && item.name === l.name ? name(item) : l.name;
  }

  window.TapigoI18n = {
    LANGS: LANGS, offered: offered, detect: detect, set: set, t: t,
    lang: function () { return current; },
    useMenu: useMenu, srcOf: srcOf, name: name, desc: desc, cat: cat, group: group, choice: choice, tag: tag,
    tagline: tagline, lineName: lineName
  };
})();

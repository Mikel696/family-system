/* Stoic — frases motivacionales del estoicismo y disciplina */
const Stoic = (() => {
  const QUOTES = [
    { t:'La felicidad de tu vida depende de la calidad de tus pensamientos.', a:'Marco Aurelio' },
    { t:'No es lo que te sucede, sino cómo reaccionas a ello lo que importa.', a:'Epicteto' },
    { t:'El obstáculo es el camino.', a:'Marco Aurelio' },
    { t:'Tenemos dos oídos y una boca para escuchar el doble de lo que hablamos.', a:'Epicteto' },
    { t:'No es el hombre que tiene poco, sino el que ansía más, el que es pobre.', a:'Séneca' },
    { t:'Cada nuevo principio proviene del final de algún otro principio.', a:'Séneca' },
    { t:'Despierta el guerrero interior. Sé fuerte, sé constante, sé tú mismo.', a:'Marco Aurelio' },
    { t:'Una piedra es lanzada al aire, no le daña caer al suelo. Tampoco el alma ante la adversidad si está bien preparada.', a:'Marco Aurelio' },
    { t:'La libertad no consiste en hacer lo que queramos, sino en tener el derecho de hacer lo que debamos.', a:'Cicerón' },
    { t:'Mientras esperamos vivir, la vida pasa.', a:'Séneca' },
    { t:'El primer paso a la grandeza es ser honesto.', a:'Samuel Johnson' },
    { t:'No serás invencible, pero invencido sí.', a:'Séneca' },
    { t:'Disciplina hoy. Libertad mañana.', a:'Vir Stoicus' },
    { t:'Quien estudia, construye su libertad. Quien ahorra, construye su futuro.', a:'Vir Stoicus' },
    { t:'No esperes ser otra persona. Sé hoy la mejor versión de ti.', a:'Marco Aurelio' },
    { t:'Ahorra cuando puedas. La vida pondrá pruebas cuando no.', a:'Vir Stoicus' },
    { t:'Lo más importante de un viaje de mil pasos: el siguiente.', a:'Lao Tse' },
    { t:'La verdadera riqueza es no necesitar nada.', a:'Séneca' },
    { t:'Si quieres ser libre, esclavízate al estudio.', a:'Séneca' },
    { t:'No te conviertas en lo que el mundo espera. Conviértete en lo que tu alma exige.', a:'Marco Aurelio' },
    { t:'El que aprende y sigue aprendiendo, nunca envejece de espíritu.', a:'Henry Ford' },
    { t:'Cada moneda guardada hoy es un día de tranquilidad mañana.', a:'Vir Stoicus' },
    { t:'Hazlo difícil ahora, para que sea fácil después.', a:'Vir Stoicus' },
    { t:'La paciencia es amarga, pero su fruto es dulce.', a:'Aristóteles' },
    { t:'Sé como el agua: paciente, persistente, imparable.', a:'Bruce Lee' },
    { t:'No basta dar pasos que algún día puedan conducir hasta la meta, cada paso debe ser una meta, sin dejar de ser un paso.', a:'Goethe' },
    { t:'La calidad de tu mente determina la calidad de tu día.', a:'Marco Aurelio' },
    { t:'Vir bonus, dicendi peritus — Hombre bueno, hábil en la palabra.', a:'Catón' },
    { t:'Memento mori — Recuerda que vas a morir. Vive con propósito hoy.', a:'Sabiduría romana' },
    { t:'Amor fati — Ama tu destino. Lo que ocurre, ocurre para fortalecerte.', a:'Nietzsche' },
    { t:'No huyas del trabajo difícil. Es allí donde forjas tu carácter.', a:'Vir Stoicus' },
    { t:'El conocimiento no ocupa lugar, pero abre caminos.', a:'Vir Stoicus' }
  ];

  // Frase determinista del día (para que sea la misma en todos los dispositivos en el mismo día)
  function today() {
    const d  = new Date();
    const k  = d.getFullYear() * 1000 + (d.getMonth()+1) * 50 + d.getDate();
    return QUOTES[k % QUOTES.length];
  }

  return { today, QUOTES };
})();

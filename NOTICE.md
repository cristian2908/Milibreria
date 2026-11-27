# Atribución

## Dependencias y referencias del agregado con fotos

- **OpenCV.js** (recorte automático) — paquete `@techstark/opencv-js` 5.0.0, build de
  OpenCV para la web. OpenCV se distribuye con licencia **Apache 2.0**
  (https://github.com/opencv/opencv/blob/4.x/LICENSE). Se usa sin modificar; en el
  servidor se sirve como `estanteria/dist/vendor/opencv.js`.
- **ceodaniyal/free-llm-image-to-text** — https://github.com/ceodaniyal/free-llm-image-to-text
  Script de Python que hace OCR con modelos de visión gratuitos de OpenRouter. Se tomó la
  idea y el modelo por defecto (`amazon/nova-2-lite-v1:free`); la integración en
  `api/estanteria-routes.js` se escribió en Node desde cero (el repositorio indica MIT en su
  README, pero no incluye archivo de licencia).

## Estantería 3D

La estantería 3D se reimplementó desde cero en React. Se usó como referencia de
comportamiento (no como base de código) el proyecto:

**mawise/bookshelf** — https://github.com/mawise/bookshelf
MIT License · Copyright (c) 2024 mawise

Conceptos tomados como referencia:
- Libro construido con caras separadas (portada, contraportada, lomo, páginas).
- Secuencia estante → portada → contraportada → estante, un libro a la vez.
- Alto a partir de la relación de aspecto de la portada.
- Grosor no lineal a partir del número de páginas (`k · páginas^0.6`).
- Color del lomo tomado del borde de la portada y texto claro/oscuro según contraste.

No se copió código fuente del repositorio. Si en el futuro se copia algún fragmento,
se debe incluir aquí el texto completo de la licencia MIT original:

```
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

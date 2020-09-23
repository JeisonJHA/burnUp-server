import express from 'express'
import cors from 'cors'
import { parseISO } from 'date-fns'

import Burn, { IDadosBurn } from './burn'

const app = express()
const port = process.env.PORT ?? 3333

app.use(cors())
app.use(express.json())
app.use(express.json());

app.get('/', async (req, res) => {
  const { usuario, senha, inicio, fim, url, debug } = req.query;
  if (debug) console.log('operação iniciada.')
  const burn = new Burn(String(url), Boolean(debug))
  const dados = await burn.getDados({ usuario, senha, inicio: parseISO(String(inicio)), fim: parseISO(String(fim)) } as IDadosBurn)
  return res.json(dados)
})

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`)
})
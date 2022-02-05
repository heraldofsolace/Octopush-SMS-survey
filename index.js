const express = require('express')
const app = express()
const port = 3000
const octopush = require('octopush')
const config = require('./config.js')
const questions = require('./questions')

const sqlite3 = require('sqlite3').verbose()

app.use(express.json())

const sms = new octopush.SMS(config.user_login, config.api_key)

let db = new sqlite3.Database('./replies.db', (err) => {
  if (err) {
    console.error(err.message);
  }
  console.log('Connected to the replies database.');
})

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS replies(
            recipient_number TEXT,
            question_id INTEGER,
            reply TEXT,
            replied_at TEXT
          )
    `).run(`CREATE TABLE IF NOT EXISTS current_state(
              recipient_number TEXT PRIMARY KEY,
              question_id INTEGER
            )`)
})


app.post('/start', (req, res) => {
  console.log(req.body.recipients)
  sms.set_sms_text(questions[0])
  sms.set_sms_recipients(req.body.recipients)
  sms.set_sms_type(config.sms_type)
  sms.set_sms_sender(config.sms_sender)
  sms.set_sms_request_id(sms.uniqid())
  sms.set_sms_mode(config.sms_mode)
  sms.set_option_with_replies(true)

  sms.send((e, r) => {
    if(e) {
      console.log('Error:', r)
      res.status(500).send(r)
    } else {
      const stmt = db.prepare("INSERT INTO current_state VALUES(?, ?)")
      req.body.recipients.forEach((recipient) => {
        stmt.run(recipient, 0)
      })
      stmt.finalize()
      res.send(`Success: ${JSON.stringify(r)}`)
    }
  })
})

app.post('/reply', (req, res) => {
  const { number, text, reception_date } = req.body

  db.serialize(() => {
    db.get(`SELECT question_id 
            FROM current_state
            WHERE recipient_number = ?`, [number], (err, row) => {
              if(err || !row)
                return res.sendStatus(200)
              db.run(`INSERT INTO replies VALUES(?, ?, ?, ?)`,
                [number, row.question_id, text, reception_date], (err) => {
                  if(err) return res.sendStatus(200)
                  if(row.question_id + 1 >= questions.length) 
                    return res.status(200).send('Finished')
                
                  const next_question = questions[row.question_id + 1]
                  
                  sms.set_sms_text(next_question)
                  sms.set_sms_recipients([number])
                  sms.set_sms_type(config.sms_type)
                  sms.set_sms_sender(config.sms_sender)
                  sms.set_sms_request_id(sms.uniqid())
                  sms.set_sms_mode(config.sms_mode)
                  sms.set_option_with_replies(true)

                  sms.send((e, r) => {
                    console.log(e, r)
                    if(e)
                      return res.sendStatus(200)
                    db.run(`UPDATE current_state
                            SET question_id = ?
                            WHERE recipient_number = ?`, [row.question_id + 1, number], 
                            (err, row) => {
                              if(err)
                                return res.sendStatus(200)
                              res.status(200).send("Success")
                            })
                  })
          
              })    
    })
  })


})
app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`)
})

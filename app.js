const express = require('express')
const expressHandelbars = require('express-handlebars')
const sqlite3 = require('sqlite3')
const multer  = require('multer')
const path = require('path')
const bodyParser = require('body-parser')
const expressSession = require('express-session')
const bcrypt = require('bcryptjs')
const csrf = require('csurf')

const csrfProtection = csrf({ cookie: false})
const parseForm = bodyParser.urlencoded ({extended: false})

const MIN_TITLE_LENGTH = 2
const MIN_DESCRIPTION_LENGTH = 10
const MIN_QUESTION_LENGTH = 5
const MIN_ANSWER_LENGTH = 5

const storage = multer.diskStorage({
    destination: './img/portfolio/',
    filename: function(req, file, cb){
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname))
    }
})

const upload = multer({
    storage: storage,
    limits:{fileSize: 10000000},
    fileFilter: function(req, file, cb){
        checkFileType(file, cb)
    }
}).single('image')

function checkFileType(file, cb) {
    const allowedFiletypes = /jpeg|jpg|png|gif/

    const isExtensionAllowed = allowedFiletypes.test(path.extname(file.originalname).toLowerCase())

    const mimetype = allowedFiletypes.test(file.mimetype)

    if (isExtensionAllowed && mimetype) {
        return cb(null, true)
    }else{
        cb('Error: Images only')
    }
}

const db = new sqlite3.Database("my-database.db")


db.run(`
    CREATE TABLE IF NOT EXISTS portfolio(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        description TEXT,
        image TEXT
    )
`)
db.run(`
    CREATE TABLE IF NOT EXISTS question(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        question TEXT,
        answer TEXT
    )
`)
db.run(`
    CREATE TABLE IF NOT EXISTS contact(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        email TEXT,
        phone INTEGER,
        message TEXT,
        answer TEXT,
        status TEXT
    )
`)

const app = express()

app.use(express.static('static'))

app.use(bodyParser.urlencoded({     // to support URL-encoded bodies
    extended: false
  }))

app.use(expressSession({
    secret: "aswdnawrmawrtam",
    saveUninitialized: false,
    resave: false

}))

app.use(function(req, res, next){
    res.locals.isLoggedIn = req.session.isLoggedIn
    next()
})

app.engine('.hbs', expressHandelbars({
    defaultLayout: 'main.hbs'
}))

const adminUser = "admin"
const adminPass = "$2b$10$Vbz5tNWmTOxa7At7wtXd3uA/npj1oG2rce6L9Ekg4lzucIrDLNwta"

app.use(express.static('img'))
app.use(express.static('img/portfolio'))

app.get('/', csrfProtection, function(req, res){
    res.render('start.hbs', { csrf: req.csrfToken()})
})

app.get('/portfolio', csrfProtection, function(req, res){

    const query = "SELECT * FROM portfolio"

    db.all(query, function(error, projects) {
        if (error) {
            const model = {
                dbError: 'An error occurred, try again'
            }
            res.render('portfolio.hbs', model)
        }
        else{
            projects.reverse()
            const model = {
                projects,
                csrf: req.csrfToken()
            }
            res.render('portfolio.hbs', model)
        }
    })
})
app.get('/portfolio/:id', csrfProtection, function(req, res){

    const query = "SELECT * FROM portfolio"
    var focusedProject
    const projects = []

    db.all(query, function(error, allProjects) {
        if (error) {
            const model = {
                dbError: 'An error occurred, try again'
            }
            res.render('project.hbs', model)
        }
        else{
            for (let i = 0; i < allProjects.length; i++) {
                if (allProjects[i].id == req.params.id) {
                    focusedProject = allProjects[i]
                }
                else{
                    projects.push(allProjects[i])
                }
            }
            projects.reverse()
            const model = {
                projects,
                focusedProject,
                csrf: req.csrfToken()
            }
            res.render('project.hbs', model)
        }
    })
})

app.post('/portfolio/:id', csrfProtection, parseForm, function(req, res){
    if (req.session.isLoggedIn) {
        const title = req.body.title
        const description = req.body.description
        const id = req.params.id
        var query
        var values

        if (req.body.btnID == "save") {
            if (title.length < MIN_TITLE_LENGTH || description.length < MIN_DESCRIPTION_LENGTH) {
                const model = {
                    fieldErrors: [
                        `Title needs to be more than ${MIN_TITLE_LENGTH} characters`,
                        `Description needs to be more than ${MIN_DESCRIPTION_LENGTH} characters`
                    ]
                }
                res.render('project.hbs', model)
            }else{
                query = "UPDATE portfolio SET title = ?, description = ? WHERE id = ?"
                values = [title, description, id]
            }
        }else if (req.body.btnID == "delete"){
            query = "DELETE FROM portfolio WHERE id=?"
            values = [id]
        }else{
            res.redirect('/portfolio')
        }
        if (query != null) {
            db.run(query, values, function(error){
                if (error) {
                    const model = {
                        dbError: 'An error occurred, try again'
                    }
                    res.render('portfolio.hbs', model)
                }
                else{
                    res.redirect('/portfolio')
                }
            })
        }
    }else{
        const model = {
            error: 'You have to be logged in for this feature'
        }
        res.render('portfolio.hbs', model)
    }
})

app.get('/create-project', csrfProtection, function(req, res){
    if (req.session.isLoggedIn) {
        res.render('create-project.hbs', { csrf: req.csrfToken()})
    }else{
        res.redirect('/portfolio')
    }
})

app.post('/create-project', function(req, res){
    if (req.session.isLoggedIn) {
        upload(req, res, (error) =>{
            if (error) {
                const model = {
                    uploadError: 'An error occurred, try again'
                }
                res.render('create-project.hbs', model)
            }
            else{
                const title = req.body.title    
                const description = req.body.description
                const image = req.file.filename

                if(title.length < MIN_TITLE_LENGTH || description.length < MIN_DESCRIPTION_LENGTH || image == null){
                    const model = {
                        fieldErrors: [
                            `Title needs to be more than ${MIN_TITLE_LENGTH} characters`,
                            `Description needs to be more than ${MIN_DESCRIPTION_LENGTH} characters`,
                            'You need to select an image'
                        ]
                    }
                    res.render('create-project.hbs', model)
                } 
                else{
                    const query = "INSERT INTO portfolio (title, description, image) VALUES (?, ?, ?)"
                    const values = [title, description, image]

                    db.run(query, values, function(error){
                        if (error) {
                            const model = {
                                dbError: 'An error occurred, try again'
                            }
                            res.render('create-project.hbs', model)
                        }
                        else{
                            res.redirect('/portfolio')
                        }
                    })
                }
            }
        })
    }else{
        res.render('portfolio.hbs')
    }
})

app.get('/about', csrfProtection, function(req, res){
    res.render('about.hbs', { csrf: req.csrfToken()})
})

app.get('/contact', csrfProtection, function(req, res){
    const query = "SELECT * FROM contact"

    db.all(query, function(error, contact) {
        if (error) {
            const model = {
                dbError: 'An error occurred, try again'
            }
            res.render('contact.hbs', model)
        }
        else{
            contact.reverse()
            const model = {
                dbError: false,
                contact,
                csrf: req.csrfToken()
            }
            res.render('contact.hbs', model)
        }
    })
})

app.post('/contact', csrfProtection, parseForm, function(req, res){
    const name = req.body.namez
    const email = req.body.email
    const phone = req.body.phone
    const message = req.body.message
    const status = "new"

    const query = "INSERT INTO contact (name, email, phone, message, status) VALUES (?, ?, ?, ?, ?)"
    const values = [name, email, phone, message, status]

    db.run(query, values, function(error){
        if (error) {
            const model = {
                dbError: 'An error occurred, try again'
            }
            res.render('contact.hbs', model)
        }
        else{
            res.redirect('/contact')
        }
    })
})

app.post('/answer-message', csrfProtection, parseForm, function(req, res){
    if (req.session.isLoggedIn) {
        const status = "answered"
        const answer = req.body.answer
        const id = req.body.id
        
        var query
        var values
        
        if (req.body.btnID == "submit") {
            if (answer.length < MIN_ANSWER_LENGTH) {
                const model = {
                    fieldErrors: [
                        `Answer needs to be more than ${MIN_ANSWER_LENGTH} characters`
                    ]
                }
                res.render('contact.hbs', model)
            }else{
                query = "UPDATE contact SET status = ?, answer = ? WHERE id = ?"
                values = [status, answer, id]
            }
        }else if (req.body.btnID == "delete"){
            query = "DELETE FROM contact WHERE id=?"
            values = [id]
        }else{
            res.redirect('/contact')
        }
        if (query != null) {            
            db.run(query, values, function(error){
                if (error) {
                    const model = {
                        dbError: 'An error occurred, try again'
                    }
                    res.render('contact.hbs', model)
                }
                else{
                    res.redirect('/contact')
                }
            })
        }
    }else{
        res.redirect('contact.hbs')
    }
})

app.get('/faq', csrfProtection, function(req, res){
    const query = "SELECT * FROM question"

    db.all(query, function(error, questions) {
        if (error) {
            const model = {
                dbError: 'An error occurred, try again'
            }
            res.render('faq.hbs', model)
        }
        else{
            questions.reverse()
            const model = {
                dbError: false,
                questions,
                csrf: req.csrfToken()
            }
            res.render('faq.hbs', model)
        }
    })
})

app.post('/faq', csrfProtection, parseForm, function(req, res){
    if (req.session.isLoggedIn) {
        const id = req.body.id
        const query = "DELETE FROM question WHERE id=?"
        const values = [id]

        db.run(query, values, function(error){
            if (error) {
                const model = {
                    dbError: 'An error occurred, try again'
                }
                res.render('faq.hbs', model)
            }
            else{
                res.redirect('/faq')
            }
        })
    }
})

app.get('/ask-question', csrfProtection, function(req, res){
    res.render('ask-question.hbs', { csrf: req.csrfToken()})
})

app.post('/ask-question', csrfProtection, parseForm, function(req, res){
    const question = req.body.title   
    if (question.length < MIN_QUESTION_LENGTH) {
        const model = {
            fieldError: `Your question needs to be atleast ${MIN_QUESTION_LENGTH} characters`
        }
        res.render('ask-question.hbs', model)
    } 
    else{
        const query = "INSERT INTO question (question) VALUES (?)"
        const values = [question]

        db.run(query, values, function(error){
            if (error) {
                const model = {
                    dbError: 'An error occurred, try again'
                }
                res.render('ask-question.hbs', model)
            }
            else{
                res.redirect('/faq')
            }
        })
    }
})

app.get('/answer-question', csrfProtection, function(req, res){
    if (req.session.isLoggedIn) {
        const query = "SELECT * FROM question"

        db.all(query, function(error, questions) {
            if (error) {
                const model = {
                    dbError: 'An error occurred, try again'
                }
                res.render('answer-question.hbs', model)
            }
            else{
                const model = {
                    questions,
                    csrf: req.csrfToken()
                }
                res.render('answer-question.hbs', model)
            }
        })
    }else{
        res.redirect('/')
    }
})

app.post('/answer-question', csrfProtection, parseForm, function(req, res){

    if (req.session.isLoggedIn) {
        const answer = req.body.answer
        const id = req.body.id
        
        const query = "UPDATE question SET answer = ? WHERE id = ?"
        const values = [answer, id]
    
        if (answer.length < MIN_ANSWER_LENGTH) {
            const model = {
                fieldError: `Your answer needs to be atleast ${MIN_ANSWER_LENGTH} characters`
            }
            res.render('answer-question.hbs', model)
        }else{
            db.run(query, values, function(error){
                if (error) {
                    const model = {
                        dbError: 'An error occurred, try again'
                    }
                    res.render('answer-question.hbs', model)
                }
                else{
                    res.redirect('/faq')
                }
            })
        }
    }else{
        res.redirect('/')
    }
})

app.get('/edit-question', csrfProtection, function(req, res){
    if (req.session.isLoggedIn) {
        const query = "SELECT * FROM question"

        db.all(query, function(error, questions) {
            if (error) {
                const model = {
                    dbError: 'An error occurred, try again'
                }
                res.render('edit-question.hbs', model)
            }
            else{
                const model = {
                    questions,
                    csrf: req.csrfToken()
                }
                res.render('edit-question.hbs', model)
            }
        })
    }else{
        res.redirect('/')
    }
})

app.post('/edit-question', csrfProtection, parseForm, function(req, res){
    if (req.session.isLoggedIn) {
        const answer = req.body.answer
        const id = req.body.id
        const query = "UPDATE question SET answer = ? WHERE id = ?"
        const values = [answer, id]

        if (answer.length < MIN_ANSWER_LENGTH) {
            const model = {
                fieldError: `Your answer needs to be atleast ${MIN_ANSWER_LENGTH} characters`
            }
            res.render('answer-question.hbs', model)
        }else{
            db.run(query, values, function(error){
                if (error) {
                    const model = {
                        dbError: 'An error occurred, try again'
                    }
                    res.render('edit-question.hbs', model)
                }
                else{
                    res.redirect('/faq')
                }
            })
        }
    }else{
        res.redirect('/')
    }
})

app.get('/admin', csrfProtection, function(req, res){
    res.render('login.hbs', { csrf: req.csrfToken()})
})

app.post('/admin', csrfProtection, parseForm, function(req, res){
    const inputUser = req.body.username
    const inputPass = req.body.password

    const check = bcrypt.compareSync(inputPass, adminPass)

    if(adminUser == inputUser && check){
        //login user
        req.session.isLoggedIn = true
        res.redirect("/")
    }else{
        const model = {
            dbError: true
        }
        res.render("login.hbs", model)
           // todo display error message
    }
})

app.post("/logout", csrfProtection, parseForm, function(req,res){
    req.session.isLoggedIn = false
    res.redirect("/")
})

app.get('*', csrfProtection, function(req, res){
    res.render('invalid-directory.hbs', { csrf: req.csrfToken()})
})

app.listen(3000)

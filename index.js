var express = require('express');
var app = express();
var bodyParser = require('body-parser');
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');
const formidable = require('formidable');
const { v4: uuidv4 } = require('uuid');
const mime = require('mime-types');
const path = require('path');
const fs = require('fs');
const request = require('request')
const dropboxV2Api = require('dropbox-v2-api');
const cloudinary = require('cloudinary').v2;

var http = require('http');

const dropboxKey = '2qfT4TJU3QkAAAAAAAAAAWg3p69q5nHyIYmuYt4LhCyBWcxOyFgvST1VzwLGoSsw'
// const token = "QhueogHcQrIAAAAAAAAAAclDBWW7EiLD9-rMklQ6uKUKYE1CPw5SaYNX8znZOe3U"
var urlencodedParser = bodyParser.urlencoded({ extended: false })
app.use(express.static('public'));
app.use(express.static(__dirname + '/'));
app.use(bodyParser.urlencoded({ extend: true }));
app.engine('html', require('ejs').renderFile);
app.set('view engine', 'ejs');
app.set('views', __dirname);


const dropbox = dropboxV2Api.authenticate({
   token: dropboxKey
});

app.get('/', async function (req, res) {
   let result = await db.collection('HHPlaceCollection').get();
   let returnData = []
   result.forEach(doc => {
      returnData.push(doc);
   });
   fs.readdir("uploads", (err, files) => {
      if (err) throw err;
      for (const file of files) {
         fs.unlink(path.join("uploads", file), err => {
            if (err) throw err;
         });
      }
   });
   res.render("index.ejs", { good: "title", returnData: returnData });
})

app.get('/delete', async function (req, res) {
   let id = req.query.id;
   let result = await db.collection('HHPlaceCollection').doc(id).delete();
   res.redirect('/');
})

app.get('/download', async function (req, res) {
   let id = req.query.id;
   let result = await db.collection('HHPlaceCollection').doc(id).get();
   let originPath = result.data().filePath;
   let fileName = __dirname + result.data().fileName;
   if (result.data().type == "firebase") {
      download(originPath, fileName, () => {
         res.download(fileName)
      });
   } else if(result.data().type == 'dropbox') {
      dropbox({
         resource: 'files/download',
         parameters: {
            path: originPath
         }
      }, (err, result, response) => {
         res.download(fileName)
      }).pipe(fs.createWriteStream(fileName));
   } else if(result.data().type == "cloudinary"){
      download(originPath, fileName, () => {
         res.download(fileName)
      });
   }
})

const download = (url, path, callback) => {
   request.head(url, (err, res, body) => {
      request(url)
         .pipe(fs.createWriteStream(path))
         .on('close', callback)
   })
}
const imageUpload = async (filePath) => {
   const fileMime = mime.lookup(filePath);
   let p = await new Promise((resolve, reject) => {
      bucket.upload(filePath, {
         uploadType: "media",
         metadata: {
            contentType: fileMime,
            metadata: {
               firebaseStorageDownloadTokens: uuid
            }
         }
      }).then(data => {
         var downloadUrl = "https://firebasestorage.googleapis.com/v0/b/" + bucketName + "/o/" + encodeURIComponent(data[0].name) + "?alt=media&token=" + data[0].metadata.metadata.firebaseStorageDownloadTokens;
         try {
            fs.unlinkSync(filePath)
         } catch (err) {
            console.error(err)
         }
         resolve(downloadUrl);
      });
   });
   return p;
}
app.post('/upload', async (req, res) => {
   let longitude = req.body.longitude;
   let latitude = req.body.latitude;

   let position = new admin.firestore.GeoPoint(parseFloat(latitude),parseFloat(longitude));
   let name = req.body.name;
   let filePath = req.body.filePath;
   let type = req.body.type;

   if (filePath == "") {
      return res.redirect("/");
   }
   let return_url = "";
   let url = "";
   if (type == "dropbox") {
      dropbox({
         resource: 'files/upload',
         parameters: {
            path: '/dropbox' + filePath
         },
         readStream: fs.createReadStream(__dirname + filePath)
      }, (err, result, response) => {
      });
      let dropboxPath = '/dropbox' + filePath;
      return_url = dropboxPath;
      url = req.headers.host + "/" + uuidv4()
   } else if (type == "firebase") {
      return_url = await imageUpload(__dirname + filePath);
      url = req.headers.host + "/" + uuidv4()
   } else if (type == "cloudinary") {
      cloudinary.config({
         cloud_name: 'dgmmw6drd',
         api_key: '192174829776232',
         api_secret: 'KAnKyM6nP-2-LFeslX4CIkk-kk8'
      });
      let realPath = __dirname + filePath;
      let uploadResponse = await cloudinary.uploader.upload(realPath, {});
      return_url = uploadResponse.url;
      url = req.headers.host + "/" + uuidv4()
   }
   let data = {
      name: name,
      position: position,
      filePath: return_url,
      url: url,
      fileName: filePath,
      type: type
   }
   const result = await db.collection('HHPlaceCollection').doc(uuidv4()).set(data);
   return res.redirect('/');
})
app.post('/uploadimage', (req, res) => {
   var form = new formidable.IncomingForm();
   form.parse(req);
   // specify that we want to allow the user to upload multiple files in a single request
   form.multiples = true;
   // store all uploads in the /uploads directory
   form.uploadDir = path.basename(path.dirname('/uploads/json_files/'))
   let p = new Promise((resolve, reject) => {
      form.on('file', function (field, file) {
         let fileName = "";
         fs.rename(file.path, path.join(form.uploadDir, file.name), function (err) {
            if (err) throw err;
            const file_path = '/uploads/' + file.name;
            resolve(file_path);
         });
      });
   });
   p.then((fileName) => {
      return res.json(fileName)
   });
})

var server = app.listen(process.env.PORT || 8000, function () {
   var host = server.address().address
   var port = server.address().port
   console.log("Example app listening at http://%s:%s", host, port)
})

const bucketName = "hhuble.appspot.com";

let uuid = uuidv4();


admin.initializeApp({
   credential: admin.credential.cert(serviceAccount),
   storageBucket: bucketName
})


const db = admin.firestore();
var bucket = admin.storage().bucket();


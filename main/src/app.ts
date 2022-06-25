import * as express from "express"
import * as cors from "cors"
import {createConnection} from "typeorm";
import * as amqp from "amqplib/callback_api";
import {Product} from "./entity/product";
import axios from "axios";

createConnection().then(db=>{
    const productRepository = db.getMongoRepository(Product)

    amqp.connect('amqp://localhost', function(error0, connection) {
        if (error0) {
            throw error0
        }

        connection.createChannel((error1, channel) => {
            if (error1) {
                throw error1
            }

            channel.assertQueue("product_created", {durable: true})
            channel.assertQueue("product_updated", {durable: true})
            channel.assertQueue("product_deleted", {durable: true})

            const app = express()
            app.use(cors({
                origin: ["http://localhost:3000", "http://localhost:8080", "http://localhost:4200"]
            }))

            app.use(express.json())

            channel.consume("product_created", async (msg) => {
                const eventProduct: Product = JSON.parse(msg.content.toString())
                const product = new Product()
                product.admin_id = parseInt(eventProduct.id)
                product.title = eventProduct.title
                product.image = eventProduct.image
                product.likes = eventProduct.likes
                await productRepository.save(product)
                console.log("product created")
            }, {noAck: true})

            channel.consume("product_updated", async (msg) => {
                const eventProduct: Product = JSON.parse(msg.content.toString())
                const product = await productRepository.findOne(
                    {where: {admin_id: parseInt(eventProduct.id)}}
                )
                await productRepository.merge(product, {
                    title: eventProduct.title,
                    image: eventProduct.image,
                    likes: eventProduct.likes
                })
                await productRepository.save(product)
                console.log("product updated")
            }, {noAck: true})

            channel.consume("product_deleted", async (msg) => {
                await productRepository.deleteOne({
                    admin_id: parseInt(msg.content.toString())
                })
                console.log("product deleted")
            }, {noAck: true})

            // @ts-ignore
            app.get("/api/products", async (req: Request, res:Response) => {
                const products = await productRepository.find()
                res.send(products)
            })

            // @ts-ignore
            app.post("/api/products/:id/like", async (req: Request, res:Response) => {
                const product = await productRepository.findOne(req.params.id)
                axios.post("http://localhost:8000/api/products/"+product.admin_id+"/like", {})
                product.likes++;
                await productRepository.save(product)
                res.send(product)
            })

            app.listen(8001)
            console.log("listening to port 8001")

            process.on("beforeExit", () => {
                console.log("Closing...")
                connection.close()
            })
        })
    })
}).catch(error => console.log(error))
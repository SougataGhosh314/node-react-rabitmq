import * as express from "express"
import {Request, Response} from "express"
import * as cors from "cors"
import {createConnection} from "typeorm";
import {Product} from "./entity/product";
import * as amqp from "amqplib/callback_api";

createConnection().then(db=>{

    const productRepository = db.getRepository(Product);

    amqp.connect('amqp://localhost', function(error0, connection) {
        if (error0) {
            throw error0
        }

        connection.createChannel((error1, channel) => {
            if (error1) {
                throw error1
            }

            const app = express()
            app.use(cors({
                origin: ["http://localhost:3000", "http://localhost:8080", "http://localhost:4200"]
            }))

            app.use(express.json())

            app.get("/api/products", async (_req: Request, res:Response) => {
                const products = await productRepository.find()
                res.json(products)
            })

            app.post("/api/products", async (req: Request, res:Response) => {
                const product = productRepository.create(req.body);
                const result = await productRepository.save(product);
                channel.sendToQueue("product_created", Buffer.from(JSON.stringify(result)))
                res.send(result)
            })

            app.get("/api/products/:id", async (req: Request, res:Response) => {
                const product = await productRepository.findOne({
                    where: {id: parseInt(req.params.id, 10)}
                });
                res.send(product)
            })

            app.put("/api/products/:id", async (req: Request, res:Response) => {
                const product = await productRepository.findOne({
                    where: {id: parseInt(req.params.id, 10)}
                });
                productRepository.merge(product, req.body);
                const result = await productRepository.save(product)
                channel.sendToQueue("product_updated", Buffer.from(JSON.stringify(result)))
                res.send(result)
            })

            app.delete("/api/products/:id", async (req: Request, res:Response) => {
                const result = await productRepository.delete(req.params.id)
                channel.sendToQueue("product_deleted", Buffer.from(req.params.id))
                res.send(result)
            })

            app.post("/api/products/:id/like", async (req: Request, res:Response) => {
                const product = await productRepository.findOne({
                    where: {id: parseInt(req.params.id, 10)}
                });
                product.likes++;
                const result = await productRepository.save(product);
                res.send(result)
            })

            app.listen(8000)
            console.log("listening to port 8000")

            process.on("beforeExit", () => {
                console.log("Closing...")
                connection.close()
            })
        })
    });


}).catch(error => console.log(error))
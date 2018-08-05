(ns slack-signup.web
  (:require [compojure.core :refer [defroutes GET PUT POST DELETE ANY]]
            [compojure.handler :refer [site]]
            [compojure.route :as route]
            [clojure.java.io :as io]
            [ring.adapter.jetty :as jetty]
            [ring.middleware.resource :refer [wrap-resource]]
            [environ.core :refer [env]]))

(use 'ring.middleware.resource)

(defn splash []
  {:status 200
   :headers {"Content-Type" "text/html"}
   :body (slurp (io/resource "signup.html"))})

(defroutes app
  (GET "/" []
       (splash))
  (ANY "*" []
       (route/not-found (slurp (io/resource "404.html")))))

(def handler
  (wrap-resource (site #'app) "public"))

(defn -main [& [port]]
  (let [port (Integer. (or port (env :port) 5000))]
    (jetty/run-jetty
      handler
      {:port port :join? false})))

;; For interactive development:
;; (.stop server)
;; (def server (-main))
